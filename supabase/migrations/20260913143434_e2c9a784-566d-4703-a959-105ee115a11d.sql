-- 1) normalização + guarda de coerência em artist_content
CREATE OR REPLACE FUNCTION public.artist_content_normalize_song_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.song_id IS NULL THEN
    NEW.song_link_status := 'none';
    NEW.song_link_reason := NULL;
  ELSIF coalesce(NEW.song_link_status, 'none') = 'none' THEN
    NEW.song_link_status := 'estimated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_artist_content_normalize_song_link ON public.artist_content;
CREATE TRIGGER trg_artist_content_normalize_song_link
BEFORE INSERT OR UPDATE ON public.artist_content
FOR EACH ROW EXECUTE FUNCTION public.artist_content_normalize_song_link();

UPDATE public.artist_content
   SET song_link_status = 'none', song_link_reason = NULL
 WHERE song_id IS NULL AND song_link_status <> 'none';

ALTER TABLE public.artist_content
  DROP CONSTRAINT IF EXISTS artist_content_song_link_coherent;
ALTER TABLE public.artist_content
  ADD CONSTRAINT artist_content_song_link_coherent
  CHECK (song_id IS NOT NULL OR song_link_status NOT IN ('estimated', 'confirmed'));

-- 2) auto-reparação: linhas 'estimated' sem song_id voltam a ser candidatas
CREATE OR REPLACE FUNCTION public.artist_content_link_songs(p_artist_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS TABLE(content_id uuid, song_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row record;
  v_match record;
  v_hits int;
  v_n int;
  v_reason text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _cand(base text, sid uuid, is_launch boolean, release_date date, how text) ON COMMIT DROP;

  FOR v_row IN
    SELECT c.id, c.artist_id, c.platform,
           lower(extensions.unaccent(coalesce(c.title, '') || ' ' || coalesce(c.caption_excerpt, ''))) AS hay
      FROM public.artist_content c
     WHERE c.song_id IS NULL
       AND coalesce(c.song_link_status, 'none') IN ('none', 'estimated')
       AND (p_artist_id IS NULL OR c.artist_id = p_artist_id)
  LOOP
    DELETE FROM _cand WHERE true;

    INSERT INTO _cand(base, sid, is_launch, release_date, how)
    SELECT b.base, b.id, b.is_launch, b.release_date,
           CASE WHEN position(b.base in v_row.hay) > 0 THEN 'menção' ELSE 'hashtag' END
      FROM (
        SELECT s.id, s.is_launch, s.release_date,
               public.artist_song_base_title(s.title) AS base
          FROM public.artist_songs s
         WHERE s.artist_id = v_row.artist_id
           AND coalesce(s.tracking_status, '') <> 'arquivado'
      ) b
     WHERE length(b.base) >= 4
       AND (
         position(b.base in v_row.hay) > 0
         OR position('#' || replace(b.base, ' ', '') in v_row.hay) > 0
       );

    SELECT count(DISTINCT base) INTO v_hits FROM _cand;

    IF v_hits = 0 THEN
      CONTINUE;
    ELSIF v_hits > 1 THEN
      RETURN QUERY SELECT v_row.id, NULL::uuid,
        'ambíguo: ' || (SELECT string_agg(DISTINCT base, ' | ') FROM _cand);
      CONTINUE;
    END IF;

    SELECT c.sid, c.base, c.how
      INTO v_match
      FROM _cand c
     ORDER BY c.is_launch DESC NULLS LAST, c.release_date ASC NULLS LAST
     LIMIT 1;

    SELECT count(*) INTO v_n FROM _cand;
    IF v_n > 1 THEN
      IF (SELECT count(*) FROM _cand c
           WHERE coalesce(c.is_launch,false) = (SELECT coalesce(max(is_launch::int),0)::boolean FROM _cand)
             AND c.release_date IS NOT DISTINCT FROM (
                 SELECT min(release_date) FROM _cand
                  WHERE coalesce(is_launch,false) = (SELECT coalesce(max(is_launch::int),0)::boolean FROM _cand))
         ) > 1 THEN
        RETURN QUERY SELECT v_row.id, NULL::uuid,
          'ambíguo: várias versões de "' || v_match.base || '" sem critério de desempate';
        CONTINUE;
      END IF;
    END IF;

    v_reason := v_match.how || ' ''' || v_match.base || ''' na descrição';

    IF NOT p_dry_run THEN
      UPDATE public.artist_content
         SET song_id = v_match.sid,
             song_link_status = 'estimated',
             song_link_reason = v_reason,
             updated_at = now()
       WHERE id = v_row.id;
    END IF;

    RETURN QUERY SELECT v_row.id, v_match.sid, v_reason;
  END LOOP;
END;
$function$;

-- 3) prova automática
DO $$
DECLARE
  v_id uuid;
  v_status text;
  v_bad int;
BEGIN
  SELECT id INTO v_id FROM public.artist_content WHERE song_id IS NOT NULL LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.artist_content SET song_id = NULL WHERE id = v_id;
    SELECT song_link_status INTO v_status FROM public.artist_content WHERE id = v_id;
    IF v_status <> 'none' THEN
      RAISE EXCEPTION 'PROVA FALHOU: song_id NULL deixou status %', v_status;
    END IF;
  END IF;

  SELECT count(*) INTO v_bad FROM public.artist_content
   WHERE song_id IS NULL AND song_link_status IN ('estimated','confirmed');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % linhas incoerentes', v_bad;
  END IF;

  RAISE NOTICE 'PROVA D-ERP53 OK';
  RAISE EXCEPTION 'rollback da prova';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'rollback da prova' THEN RAISE; END IF;
END $$;
