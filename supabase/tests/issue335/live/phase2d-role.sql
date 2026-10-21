-- LOCAL ONLY. Catalog SELECT 2026-10-21: real deploy role postgres is not superuser.
-- Bootstrap remains supabase_admin; only setup/privileged corruption uses that role.
ALTER ROLE postgres NOSUPERUSER CREATEROLE BYPASSRLS;
GRANT authenticated,anon,service_role TO postgres WITH ADMIN TRUE, INHERIT TRUE, SET TRUE;
GRANT pg_read_all_data,pg_monitor,pg_signal_backend TO postgres WITH ADMIN TRUE;
ALTER SCHEMA auth OWNER TO supabase_admin;
REVOKE ALL ON SCHEMA auth FROM postgres;
GRANT USAGE ON SCHEMA auth TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated,service_role;
ALTER ROLE sandbox_exec LOGIN BYPASSRLS;
ALTER ROLE sandbox_exec_sfohvvlqccmmebvjgibx LOGIN BYPASSRLS;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO sandbox_exec_sfohvvlqccmmebvjgibx;
DO $$ BEGIN
 IF (SELECT rolsuper FROM pg_roles WHERE rolname='postgres') OR NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname='postgres') THEN RAISE EXCEPTION 'wrong_deployer'; END IF;
 IF has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION') THEN RAISE EXCEPTION 'auth_grant_option_must_be_absent'; END IF;
 RAISE NOTICE 'PASS deploy role postgres: NOSUPERUSER CREATEROLE BYPASSRLS; auth USAGE without grant option; default table ALL/function EXECUTE grants';
END $$;
