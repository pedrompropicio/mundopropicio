DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('t.uid', true), '')::uuid $$;
CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('t.co', true), '')::uuid $$;
CREATE FUNCTION public._effective_permissions_for(u uuid, c uuid, x text[]) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('role', coalesce(nullif(current_setting('t.role', true), ''), 'manager')) $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
