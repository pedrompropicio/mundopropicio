-- Esquema mínimo DESCARTÁVEL (PG local) para testar a migração dos contratos de cachê. Nunca correr no Cloud.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('t.uid', true),'')::uuid $$;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE public.app_role AS ENUM ('admin','manager','viewer');
CREATE TABLE public.user_roles(user_id uuid, role app_role);
CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-0000000000c1'::uuid $$;
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.has_permission(u uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.events(id uuid PRIMARY KEY, name text, date date, parent_event_id uuid, company_id uuid);
CREATE TABLE public.suppliers(id uuid PRIMARY KEY, name text, company_id uuid);
CREATE TABLE public.account_categories(id uuid PRIMARY KEY, code text, company_id uuid);
CREATE TABLE public.event_cache_configs(id uuid PRIMARY KEY, event_id uuid, supplier_id uuid);
CREATE TABLE public.event_forecasts(id uuid PRIMARY KEY, event_id uuid, amount numeric, formula_type text, cache_config_id uuid, version_id uuid);
CREATE TABLE public.transactions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text, type text, amount numeric, iva_rate int, event_id uuid,
  category_id uuid, forecast_id uuid, supplier_id uuid, account_id uuid, date date, due_date date, status text,
  paid_amount numeric DEFAULT 0, parent_transaction_id uuid REFERENCES public.transactions(id), split_percentage numeric, split_mode text,
  company_id uuid, reversed_at timestamptz, is_hidden boolean DEFAULT false, operation_key text,
  declared_withholding_amount numeric, updated_at timestamptz DEFAULT now(),
  CHECK (parent_transaction_id IS NULL OR split_percentage IS NOT NULL));
CREATE TABLE public.transaction_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid);
CREATE TABLE public.payment_lists(id uuid PRIMARY KEY, status text);
CREATE TABLE public.payment_list_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_list_id uuid, transaction_id uuid, removed_at timestamptz);
CREATE TABLE public.trash(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id uuid, entity_data jsonb, related_data jsonb, deleted_by text, company_id uuid);
CREATE TABLE public.system_invariants(name text PRIMARY KEY, description text, severity text, scope text, reference_count bigint, notes text);
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['raw','extra','paid','secrets','infra','secdef','docs','extrato','cards','tenant','duplicate_invoices','camarim','suppliers','paid_below_gross','ticketline_series','unreachable_docs','isolation','storage','rateio','cash','dre_nature'] LOOP
    EXECUTE format($f$CREATE FUNCTION public._run_invariant_checks_%s() RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql AS 'SELECT NULL::text,NULL::text,NULL::text,NULL::text,0::bigint,0::bigint,true,NULL::text,NULL::jsonb WHERE false'$f$, f);
  END LOOP; END $$;
