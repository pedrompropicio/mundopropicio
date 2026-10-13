-- D-ERP259 fase 2: as linhas de crescimento/momentum (SECURITY DEFINER, por detrás de
-- v_artist_growth_summary e v_artist_momentum) passam a filtrar pelos artistas legíveis.
DO $do$
DECLARE fn text; d0 text; d text;
  old_c text := 'WITH comp AS (SELECT c.id FROM public.companies c WHERE public.user_has_company_access(c.id)),';
  new_c text := 'WITH comp AS (SELECT DISTINCT a.company_id AS id FROM public.artists a WHERE a.id IN (SELECT public.artist_readable_ids())),';
  old_j text := 'FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id';
  new_j text := 'FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id AND m.artist_id IN (SELECT public.artist_readable_ids())';
BEGIN
  FOREACH fn IN ARRAY ARRAY['artist_growth_summary_rows','artist_momentum_rows'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=fn AND p.prokind='f';
    IF position(old_c IN d0)=0 OR position(old_j IN d0)=0 THEN
      RAISE EXCEPTION 'D-ERP259: texto não encontrado em %', fn;
    END IF;
    d := replace(replace(d0, old_c, new_c), old_j, new_j);
    EXECUTE d;
  END LOOP;
END $do$;