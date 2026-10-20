-- #333 fase12d stub local: papéis e default ACL iguais aos lidos no projeto (tabelas/funções concedidas a anon/authenticated/service_role/sandbox_exec*).
DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE sandbox_exec; CREATE ROLE sandbox_exec_x; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec, sandbox_exec_x;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role, sandbox_exec_x;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sandbox_exec, sandbox_exec_x;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, deleted_at timestamptz, banned_until timestamptz);
CREATE TABLE public.companies (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.roles_stub (u uuid, c uuid, role text);
CREATE FUNCTION public._effective_permissions_for(u uuid, c uuid, x text[]) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('role', (SELECT role FROM public.roles_stub WHERE roles_stub.u = $1 AND roles_stub.c = $2 LIMIT 1)) $$;
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111', NULL, NULL), ('33333333-3333-3333-3333-333333333333', NULL, NULL), ('55555555-5555-5555-5555-555555555555', NULL, 'infinity');
INSERT INTO public.companies VALUES ('22222222-2222-2222-2222-222222222222', 'active'), ('44444444-4444-4444-4444-444444444444', 'active'), ('66666666-6666-6666-6666-666666666666', 'inactive');
INSERT INTO public.roles_stub VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'manager'),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'viewer'), ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'admin');
