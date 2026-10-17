-- #333 fictitious schema compatible with the Live objects used by the module.
-- current_company_id and _effective_permissions_for are copied verbatim from Live (17/10/2026).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;
GRANT USAGE ON SCHEMA auth, extensions TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
CREATE TYPE public.app_role AS ENUM ('admin','user','viewer','partner','marketing_manager','editor','manager','platform_admin','field_producer','producer','content_manager','accountant');
CREATE TABLE public.companies(id uuid PRIMARY KEY, display_name text, tax_id text, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id), full_name text, company_id uuid, active_company_id uuid);
CREATE TABLE public.user_roles(id serial PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), company_id uuid, role public.app_role NOT NULL);
CREATE TABLE public.role_permissions(role public.app_role, permission text);
CREATE TABLE public.user_permissions(user_id uuid, company_id uuid, permission text, granted boolean);
CREATE TABLE public.events(id uuid PRIMARY KEY, company_id uuid, name text);
CREATE FUNCTION public.is_platform_admin(_u uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_u AND role='platform_admin') $$;
CREATE TABLE public.standalone_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, storage_path text NOT NULL, file_name text NOT NULL,
 supplier_name text, supplier_nif text, invoice_date date, total_amount numeric, iva_amount numeric, notes text,
 status text NOT NULL DEFAULT 'new' CHECK (status = ANY (ARRAY['new','processed'])), created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, processed_by uuid, invoice_number text, currency text NOT NULL DEFAULT 'EUR',
 original_amount numeric, fx_rate numeric, fx_rate_source text, paid_by_partner_id uuid REFERENCES auth.users(id),
 CHECK ((currency = 'EUR') OR ((fx_rate IS NOT NULL) AND (original_amount IS NOT NULL)))
);
-- Canonical Live index (exact spelling), unchanged.
CREATE UNIQUE INDEX uq_standalone_invoice_supplier_number ON public.standalone_invoices USING btree (company_id, supplier_nif, invoice_number) WHERE ((supplier_nif IS NOT NULL) AND (invoice_number IS NOT NULL));
-- Forbidden financial targets: any write fails loudly.
CREATE FUNCTION public.forbidden_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FORBIDDEN financial write on %', TG_TABLE_NAME; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['transactions','event_forecasts','financial_accounts','reimbursements','payment_lists','transaction_payments'] LOOP
 EXECUTE format('CREATE TABLE public.%I(id uuid PRIMARY KEY)', t);
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.forbidden_write()', t||'_forbid', t);
END LOOP; END $$;

CREATE OR REPLACE FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pa boolean := public.is_platform_admin(_user_id); v_roles text[]; v_role text; v_full boolean; v_perms text[];
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb); END IF;
  SELECT array_agg(DISTINCT role::text) INTO v_roles FROM public.user_roles
   WHERE user_id = _user_id AND (company_id = _company_id OR role = 'platform_admin'::app_role);
  SELECT r INTO v_role FROM unnest(coalesce(v_roles, '{}')) r
   ORDER BY CASE r WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
     WHEN 'accountant' THEN 3 WHEN 'marketing_manager' THEN 4 WHEN 'content_manager' THEN 4
     WHEN 'editor' THEN 4 WHEN 'producer' THEN 4 WHEN 'field_producer' THEN 4
     WHEN 'partner' THEN 5 WHEN 'viewer' THEN 6 WHEN 'user' THEN 7 ELSE 99 END, r LIMIT 1;
  v_full := v_pa OR 'admin' = ANY(coalesce(v_roles, '{}'));
  WITH base AS (
    SELECT unnest(coalesce(_universe, '{}')) k WHERE v_full
    UNION SELECT permission FROM public.role_permissions WHERE v_pa
    UNION SELECT rp.permission FROM public.role_permissions rp WHERE rp.role::text = ANY(coalesce(v_roles, '{}'))
  ), ov AS (
    SELECT permission k, bool_and(granted) g FROM public.user_permissions WHERE user_id = _user_id AND company_id = _company_id GROUP BY 1
  ), eff AS (
    SELECT b.k FROM base b LEFT JOIN ov ON ov.k = b.k WHERE ov.g IS NULL OR ov.g UNION SELECT k FROM ov WHERE g
  )
  SELECT array_agg(k ORDER BY k) INTO v_perms FROM eff;
  RETURN jsonb_build_object('role', coalesce(v_role, 'user'), 'company_id', _company_id, 'permissions', to_jsonb(coalesce(v_perms, '{}')));
END; $function$;

CREATE OR REPLACE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_active uuid; v_company uuid; v_is_pa boolean; v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT active_company_id, company_id INTO v_active, v_company FROM public.profiles WHERE id = v_uid;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN RETURN v_active; END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND company_id = v_company) THEN RETURN v_company; END IF;
  END IF;
  RETURN (SELECT ur.company_id FROM public.user_roles ur JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active' ORDER BY ur.id LIMIT 1);
END; $function$;
GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;
GRANT ALL ON public.standalone_invoices TO service_role;
