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
CREATE TABLE public.events(id uuid PRIMARY KEY, name text, date date, parent_event_id uuid, company_id uuid, status text DEFAULT 'active');
CREATE TABLE public.suppliers(id uuid PRIMARY KEY, name text, company_id uuid);
CREATE TABLE public.account_categories(id uuid PRIMARY KEY, code text, company_id uuid);
CREATE TABLE public.event_cache_configs(id uuid PRIMARY KEY, event_id uuid, supplier_id uuid, is_finalized boolean DEFAULT false);
CREATE TABLE public.event_cache_city_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cache_config_id uuid, event_id uuid, is_finalized boolean DEFAULT false);
CREATE TABLE public.event_forecasts(id uuid PRIMARY KEY, event_id uuid, amount numeric, formula_type text, cache_config_id uuid, version_id uuid, category_id uuid, description text);
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
-- 0217: âncora do BP (FK real) + dependências tratadas por delete_transaction_cascade.
ALTER TABLE public.transactions ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE public.event_forecasts ADD COLUMN company_id uuid, ADD COLUMN transaction_id uuid REFERENCES public.transactions(id);
ALTER TABLE public.payment_list_items ADD FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.transaction_payments ADD FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
CREATE TABLE public.event_cache_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id), withholding_transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.ticket_office_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transfer_transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.reimbursement_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.reimbursement_note_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.partner_paid_expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.partner_advance_expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.supplier_credit_usages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.transaction_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES public.transactions(id));
CREATE TABLE public.system_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id text, action text, changed_by text, old_data jsonb, metadata jsonb, company_id uuid);
-- cópias exatas (Live) de bp_tx_link_allowed e sync_tx_forecast_to_anchor
CREATE FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN _tx_company IS NOT NULL AND _fc_company IS NOT NULL AND _tx_company <> _fc_company THEN false
    WHEN _tx_event IS NULL THEN true WHEN _fc_event IS NULL THEN true WHEN _tx_event = _fc_event THEN true ELSE false END $$;
CREATE FUNCTION public.sync_tx_forecast_to_anchor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_anchor uuid; v_next uuid; v_fc_event uuid; v_fc_company uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.forecast_id IS NOT NULL AND OLD.forecast_id IS DISTINCT FROM NEW.forecast_id THEN
    SELECT transaction_id, event_id, company_id INTO v_anchor, v_fc_event, v_fc_company FROM public.event_forecasts WHERE id = OLD.forecast_id AND version_id IS NULL;
    IF FOUND AND v_anchor = NEW.id THEN
      SELECT t.id INTO v_next FROM public.transactions t WHERE t.forecast_id = OLD.forecast_id AND t.id <> NEW.id
        AND public.bp_tx_link_allowed(t.event_id, t.company_id, v_fc_event, v_fc_company) ORDER BY t.date, t.created_at, t.id LIMIT 1;
      UPDATE public.event_forecasts SET transaction_id = v_next WHERE id = OLD.forecast_id AND version_id IS NULL;
    END IF;
  END IF;
  IF NEW.forecast_id IS NOT NULL THEN
    SELECT transaction_id INTO v_anchor FROM public.event_forecasts WHERE id = NEW.forecast_id AND version_id IS NULL;
    IF FOUND AND v_anchor IS NULL THEN
      UPDATE public.event_forecasts SET transaction_id = NEW.id WHERE id = NEW.forecast_id AND transaction_id IS NULL AND version_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sync_tx_forecast_to_anchor AFTER INSERT OR UPDATE OF forecast_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_tx_forecast_to_anchor();
