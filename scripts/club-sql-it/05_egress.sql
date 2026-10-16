-- #326 — Prova de egress bloqueado dentro da base local.
\set ON_ERROR_STOP 1
DO $$
DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM pg_extension WHERE extname <> 'plpgsql';
  IF n <> 0 THEN RAISE EXCEPTION 'egress: há extensões instaladas (%)', n; END IF;
  SELECT count(*) INTO n FROM pg_namespace WHERE nspname IN ('net','cron','vault','extensions','supabase_functions');
  IF n <> 0 THEN RAISE EXCEPTION 'egress: schemas de rede/cron presentes'; END IF;
  SELECT count(*) INTO n FROM pg_available_extensions WHERE name IN ('pg_net','http','pg_cron','supabase_vault');
  IF n <> 0 THEN RAISE EXCEPTION 'egress: extensões de rede disponíveis para instalar (%)', n; END IF;
  IF current_setting('listen_addresses') <> '' THEN RAISE EXCEPTION 'egress: servidor aceita TCP'; END IF;
  -- Tentativa efetiva: a mesma chamada que o trigger do Clube faz tem de falhar.
  BEGIN
    EXECUTE $q$SELECT net.http_post(url := 'https://example.invalid', body := '{}'::jsonb)$q$;
    RAISE EXCEPTION 'egress: net.http_post executou';
  EXCEPTION WHEN invalid_schema_name OR undefined_function THEN
    RAISE NOTICE 'EGRESS_OK: net.http_post indisponível (%)', SQLSTATE;
  END;
  -- dblink/postgres_fdw não instaláveis.
  BEGIN
    EXECUTE 'CREATE EXTENSION dblink';
    RAISE EXCEPTION 'egress: dblink instalável';
  EXCEPTION WHEN undefined_file OR feature_not_supported OR invalid_parameter_value THEN
    RAISE NOTICE 'EGRESS_OK: dblink não instalável (%)', SQLSTATE;
  END;
END $$;
