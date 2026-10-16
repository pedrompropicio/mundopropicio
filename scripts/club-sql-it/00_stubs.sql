-- #326 — Stubs de BORDA para a base local descartável (nunca usados em Live).
-- Só o mínimo para as migrações canónicas do Clube compilarem. Nenhum stub
-- substitui o motor de pontos/crews: esse vem verbatim de drizzle/migrations.
--  * Papéis anon/authenticated/service_role: só para os GRANT/REVOKE das migrações.
--  * auth.uid()/auth.role(): leem GUCs locais (request.jwt.claim.*); RLS/Auth NÃO validados.
--  * has_role / row_belongs_to_current_company: devolvem false (só usados em RLS/CRM, fora do cenário).
--  * companies/events/event_lineups/event_marketing/contacts/fever_buyers/lead_capture: colunas mínimas.
--  * Sem extensões. Sem schema net/cron/vault: qualquer chamada de rede das funções falha localmente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true),''),'service_role') $$;
CREATE TYPE public.app_role AS ENUM ('admin','platform_admin','marketing_manager','editor','manager','producer','field_producer','partner','user','viewer');
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.row_belongs_to_current_company(company_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.companies (id uuid PRIMARY KEY, name text);
CREATE TABLE public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, name text, slug text, portal_visible boolean DEFAULT false);
CREATE TABLE public.event_lineups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid, artist_name text, artist_image_url text, artist_bio_pt text, artist_bio_en text, stage text, performance_date date, performance_time time, display_order int);
CREATE TABLE public.event_marketing (event_id uuid PRIMARY KEY);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, email text, phone text);
CREATE TABLE public.fever_buyers (company_id uuid, edition_label text, email text);
CREATE TABLE public.lead_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, source text, email text, name text, phone text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb, processed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
