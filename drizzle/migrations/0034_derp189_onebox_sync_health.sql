-- D-ERP189: a captação Onebox (H&K Madrid) entra na vigia check_ticketing_sync_health().
-- Não há tabela de config para a Onebox: a "config" é o próprio evento fixo da
-- fetch-onebox-dashboard (bf9ce2d8…), e as corridas vêm de onebox_sync_runs.
-- Mesmas condições (a/b/f), mesmo email, anti-spam 12h com sync_type 'onebox_health'.
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.check_ticketing_sync_health()'::regprocedure);
  v_cfg_old text := $a$      select 'fever'::text, 'Fever'::text, c.id, c.company_id, c.enabled, e.name
        from public.fever_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
    ),$a$;
  v_cfg_new text := $a$      select 'fever'::text, 'Fever'::text, c.id, c.company_id, c.enabled, e.name
        from public.fever_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'onebox'::text, 'Onebox'::text, e.id, e.company_id, true, e.name
        from public.events e
       where e.id = 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid
         and e.date >= current_date
    ),$a$;
  v_runs_old text := $a$      select 'fever'::text, config_id, status, started_at, error_message from public.fever_sync_runs
    ),$a$;
  v_runs_new text := $a$      select 'fever'::text, config_id, status, started_at, error_message from public.fever_sync_runs
      union all
      select 'onebox'::text, 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid, status, started_at, error_message
        from public.onebox_sync_runs
    ),$a$;
BEGIN
  IF position('onebox' in v_def) > 0 THEN RETURN; END IF;
  IF position(v_cfg_old in v_def) = 0 OR position(v_runs_old in v_def) = 0 THEN
    RAISE EXCEPTION 'D-ERP189: definição de check_ticketing_sync_health() não bate com o esperado';
  END IF;
  v_def := replace(replace(v_def, v_cfg_old, v_cfg_new), v_runs_old, v_runs_new);
  EXECUTE v_def;
END
$mig$;

REVOKE ALL ON FUNCTION public.check_ticketing_sync_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health() TO service_role;