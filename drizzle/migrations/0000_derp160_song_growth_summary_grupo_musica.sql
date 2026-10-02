-- D-ERP160 (1): song_growth_summary — grupo musica sem *_day e sem *_28d com gémea *_since_release (>28 dias).
-- Aplica um bloco de filtro sobre a versão de 20260926181000 (kpis e series intactos).
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.song_growth_summary(uuid,date)'::regprocedure);
  anchor text := '  v_pct := CASE WHEN v_sem_ant IS NULL OR v_sem_ant = 0';
  blk text := $blk$  -- D-ERP160: limpeza do grupo musica (só grupos[]; kpis e series intactos).
  DECLARE v_out jsonb := '[]'::jsonb; v_ln jsonb; v_ind text; v_omit_day text[] := '{}'; v_omit_28 text[] := '{}';
    v_mais28 boolean := s.release_date IS NOT NULL AND p_to - s.release_date > 28;
  BEGIN
    FOR v_ln IN SELECT * FROM jsonb_array_elements(g_musica) LOOP
      v_ind := v_ln->>'indicador';
      IF v_ind LIKE 's4a\_%\_day' THEN
        v_omit_day := v_omit_day || v_ind; CONTINUE;
      END IF;
      IF v_mais28 AND v_ind LIKE 's4a\_%\_28d' THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(g_musica) g
                   WHERE g->>'indicador' = regexp_replace(v_ind, '_28d$', '_since_release')
                     AND g->'atual' IS NOT NULL AND g->'atual' <> 'null'::jsonb) THEN
          v_omit_28 := v_omit_28 || v_ind; CONTINUE;
        END IF;
        v_ln := v_ln || jsonb_build_object('janela', '28d');
      END IF;
      v_out := v_out || v_ln;
    END LOOP;
    g_musica := v_out;
    IF array_length(v_omit_day, 1) > 0 THEN
      v_tec := v_tec || to_jsonb(format('grupo musica: omitidas %s — valor de um dia contra base de outro dia não é crescimento (continuam em kpis/series quando usadas).', array_to_string(v_omit_day, ', ')));
    END IF;
    IF array_length(v_omit_28, 1) > 0 THEN
      v_tec := v_tec || to_jsonb(format('grupo musica: música com mais de 28 dias — omitidas %s porque existe a gémea *_since_release com valor; as *_28d sem gémea ficam com janela=28d.', array_to_string(v_omit_28, ', ')));
    END IF;
  END;

$blk$;
BEGIN
  IF position('D-ERP160' in d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'song_growth_summary: âncora não encontrada uma única vez';
  END IF;
  EXECUTE replace(d, anchor, blk || anchor);
END
$mig$;
REVOKE ALL ON FUNCTION public.song_growth_summary(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.song_growth_summary(uuid, date) TO authenticated, service_role;