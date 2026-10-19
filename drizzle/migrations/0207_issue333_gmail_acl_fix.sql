-- #333 fase11d correção: revoga roles técnicas (sandbox_exec*) SÓ nas duas tabelas Gmail; não toca default privileges, owner nem service_role.
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_entry_gmail_connections','data_entry_gmail_pending'] LOOP
    FOR r IN SELECT DISTINCT g.grantee FROM information_schema.role_table_grants g
             WHERE g.table_schema='public' AND g.table_name=t AND g.grantee NOT IN ('postgres','service_role') LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, r);
    END LOOP;
    FOR r IN SELECT DISTINCT g.grantee FROM information_schema.column_privileges g
             WHERE g.table_schema='public' AND g.table_name=t AND g.grantee NOT IN ('postgres','service_role') LOOP
      EXECUTE format('REVOKE ALL (user_id, company_id) ON public.%I FROM %I', t, r);
    END LOOP;
  END LOOP;
END $$;
-- Guarda de catálogo: só owner e service_role podem restar (tabela e colunas).
DO $$
DECLARE extra text;
BEGIN
  SELECT string_agg(DISTINCT c.relname || ':' || x.grantee::regrole::text, ',') INTO extra
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  WHERE c.relname IN ('data_entry_gmail_connections','data_entry_gmail_pending')
    AND x.grantee <> c.relowner AND x.grantee <> 'service_role'::regrole;
  IF extra IS NULL THEN
    SELECT string_agg(DISTINCT c.relname || '.' || a.attname || ':' || x.grantee::regrole::text, ',') INTO extra
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE c.relname IN ('data_entry_gmail_connections','data_entry_gmail_pending')
      AND x.grantee <> c.relowner AND x.grantee <> 'service_role'::regrole;
  END IF;
  IF extra IS NOT NULL THEN RAISE EXCEPTION 'ACL extra em data_entry_gmail_*: %', extra; END IF;
END $$;