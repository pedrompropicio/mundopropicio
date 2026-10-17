#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?Set a disposable local socket directory}"
: "${PGPORT:?Set a disposable local port}"
: "${PGUSER:?Set the disposable cluster owner}"
case "$PGHOST" in /tmp/*) ;; *) echo 'Disposable socket required'; exit 1;; esac
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
SQL
sed -n '6,15p' supabase/manual/20261017_issue333_attempts.PENDENTE.sql | psql -X -v ON_ERROR_STOP=1
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TEMP TABLE original AS SELECT pg_get_functiondef('public.standalone_attempt_gate_333(text)'::regprocedure) gate, (SELECT row_to_json(c)::text FROM pg_class c WHERE oid='public.standalone_attempt_settings_333'::regclass) settings;
SQL
# Snapshot metadata in a persistent disposable table to compare across psql connections.
psql -X -v ON_ERROR_STOP=1 -c "CREATE TABLE original_metadata AS SELECT pg_get_functiondef('public.standalone_attempt_gate_333(text)'::regprocedure) gate, (SELECT row_to_json(c)::text FROM pg_class c WHERE oid='public.standalone_attempt_settings_333'::regclass) settings"
sha256sum supabase/manual/20261017_issue333_capabilities.PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/manual/20261017_issue333_capabilities.PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF public.standalone_attempt_capability_333() <> '{"scanner_create":false,"accountant_edit":false}'::jsonb THEN RAISE EXCEPTION 'no-row'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.standalone_attempt_capability_333()'::regprocedure AND provolatile='s' AND prosecdef AND proconfig=ARRAY['search_path=public, pg_temp']) THEN RAISE EXCEPTION 'metadata'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.standalone_attempt_capability_333()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute'; END IF;
 IF has_function_privilege('anon','public.standalone_attempt_capability_333()','EXECUTE') OR has_function_privilege('authenticated','public.standalone_attempt_capability_333()','EXECUTE') OR NOT has_function_privilege('service_role','public.standalone_attempt_capability_333()','EXECUTE') THEN RAISE EXCEPTION 'effective ACL'; END IF;
END $$;
INSERT INTO public.standalone_attempt_settings_333(operation,enabled) VALUES('scanner_create',false),('accountant_edit',false);
DO $$ BEGIN IF public.standalone_attempt_capability_333()<>'{"scanner_create":false,"accountant_edit":false}'::jsonb THEN RAISE EXCEPTION 'false rows'; END IF; END $$;
UPDATE public.standalone_attempt_settings_333 SET enabled=true WHERE operation='scanner_create';
DO $$ BEGIN IF public.standalone_attempt_capability_333()<>'{"scanner_create":true,"accountant_edit":false}'::jsonb THEN RAISE EXCEPTION 'mixed scanner'; END IF; END $$;
UPDATE public.standalone_attempt_settings_333 SET enabled=operation='accountant_edit';
DO $$ BEGIN IF public.standalone_attempt_capability_333()<>'{"scanner_create":false,"accountant_edit":true}'::jsonb THEN RAISE EXCEPTION 'mixed accountant'; END IF; END $$;
UPDATE public.standalone_attempt_settings_333 SET enabled=false;
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT public.standalone_attempt_capability_333() = '{"scanner_create":false,"accountant_edit":false}'::jsonb AS service_read_only;
DO $$ BEGIN IF public.standalone_attempt_capability_333()<>'{"scanner_create":false,"accountant_edit":false}'::jsonb THEN RAISE EXCEPTION 'service read'; END IF; END $$;
COMMIT;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM original_metadata WHERE gate<>pg_get_functiondef('public.standalone_attempt_gate_333(text)'::regprocedure) OR settings<>(SELECT row_to_json(c)::text FROM pg_class c WHERE oid='public.standalone_attempt_settings_333'::regclass)) THEN RAISE EXCEPTION 'original metadata changed'; END IF;
 IF (SELECT count(*) FROM public.standalone_attempt_settings_333)<>2 OR EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled) THEN RAISE EXCEPTION 'reader changed rows'; END IF;
 IF has_table_privilege('service_role','public.standalone_attempt_settings_333','SELECT') OR has_function_privilege('service_role','public.standalone_attempt_gate_333(text)','EXECUTE') THEN RAISE EXCEPTION 'original ACL widened'; END IF;
END $$;
SQL
for role in anon authenticated; do
 if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "SET ROLE $role; SELECT public.standalone_attempt_capability_333()"; then echo "Unexpected access: $role"; exit 1; else echo "Expected refusal for $role"; fi
done
echo 'PASS: no-row/false/mixed/reset/STABLE/search_path/SECDEF/PUBLIC/effective roles/read-only/original metadata unchanged'
