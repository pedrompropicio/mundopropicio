-- INERTE: LOCAL ONLY. Never automatically apply or place in migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.transaction_offset_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 operation_date date NOT NULL,
 account_id uuid REFERENCES public.financial_accounts(id),
 movement_amount numeric(14,2) NOT NULL,
 note text,
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','applied','reversing','reversed')),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reversed_at timestamptz,
 reversal_request_id uuid,
 reversal_reason text,
 result jsonb,
 UNIQUE(company_id,request_id),
 CHECK((movement_amount = 0 AND account_id IS NULL) OR (movement_amount <> 0 AND account_id IS NOT NULL))
);
REVOKE ALL ON public.transaction_offset_groups FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE ON public.transaction_offset_groups TO authenticated;
GRANT ALL ON public.transaction_offset_groups TO service_role;
ALTER TABLE public.transaction_offset_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offset_groups_staff ON public.transaction_offset_groups;
CREATE POLICY offset_groups_staff ON public.transaction_offset_groups FOR SELECT TO authenticated USING(public.has_staff_role(auth.uid()));
DROP POLICY IF EXISTS offset_groups_writer ON public.transaction_offset_groups;
CREATE POLICY offset_groups_writer ON public.transaction_offset_groups FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')) WITH CHECK(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
DROP POLICY IF EXISTS offset_groups_company ON public.transaction_offset_groups;
CREATE POLICY offset_groups_company ON public.transaction_offset_groups AS RESTRICTIVE FOR ALL TO authenticated USING(company_id=public.current_company_id()) WITH CHECK(company_id=public.current_company_id());
CREATE TABLE IF NOT EXISTS public.transaction_offset_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.transaction_offset_groups(id) ON DELETE RESTRICT,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
 forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE RESTRICT,
 cash_order integer NOT NULL,
 type text NOT NULL CHECK(type IN ('income','expense')),
 base_amount numeric(14,2) NOT NULL,
 iva_rate integer NOT NULL,
 gross_amount numeric(14,2) NOT NULL,
 prior_paid_amount numeric(14,2) NOT NULL,
 open_amount numeric(14,2) NOT NULL CHECK(open_amount>0),
 cash_amount numeric(14,2) NOT NULL CHECK(cash_amount>=0),
 compensation_amount numeric(14,2) NOT NULL CHECK(compensation_amount>=0),
 UNIQUE(group_id,transaction_id), UNIQUE(group_id,id,transaction_id),
 CHECK(cash_amount+compensation_amount=open_amount)
);
REVOKE ALL ON public.transaction_offset_items FROM PUBLIC, anon;
GRANT SELECT,INSERT ON public.transaction_offset_items TO authenticated;
GRANT ALL ON public.transaction_offset_items TO service_role;
ALTER TABLE public.transaction_offset_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offset_items_staff ON public.transaction_offset_items;
CREATE POLICY offset_items_staff ON public.transaction_offset_items FOR SELECT TO authenticated USING(public.has_staff_role(auth.uid()));
DROP POLICY IF EXISTS offset_items_writer ON public.transaction_offset_items;
CREATE POLICY offset_items_writer ON public.transaction_offset_items FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
DROP POLICY IF EXISTS offset_items_company ON public.transaction_offset_items;
CREATE POLICY offset_items_company ON public.transaction_offset_items AS RESTRICTIVE FOR ALL TO authenticated USING(company_id=public.current_company_id()) WITH CHECK(company_id=public.current_company_id());
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS offset_group_id uuid REFERENCES public.transaction_offset_groups(id) ON DELETE RESTRICT;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS offset_item_id uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='issue335_payment_item_fk' AND conrelid='public.transaction_payments'::regclass) THEN
 ALTER TABLE public.transaction_payments ADD CONSTRAINT issue335_payment_item_fk FOREIGN KEY(offset_group_id,offset_item_id,transaction_id) REFERENCES public.transaction_offset_items(group_id,id,transaction_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='issue335_payment_group_pair' AND conrelid='public.transaction_payments'::regclass) THEN
 ALTER TABLE public.transaction_payments ADD CONSTRAINT issue335_payment_group_pair CHECK((offset_group_id IS NULL)=(offset_item_id IS NULL));
 END IF;
END $$;
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS offset_group_id uuid REFERENCES public.transaction_offset_groups(id) ON DELETE RESTRICT;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS offset_group_id uuid REFERENCES public.transaction_offset_groups(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS issue335_payment_item_method ON public.transaction_payments(offset_item_id,payment_method) WHERE offset_item_id IS NOT NULL AND status='paid' AND reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS issue335_items_transaction ON public.transaction_offset_items(transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS issue335_bank_group ON public.bank_statement_lines(offset_group_id) WHERE offset_group_id IS NOT NULL;
-- Clear any inherited non-owner/non-app grants on the NEW relations only.
DO $$ DECLARE r record; t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transaction_offset_groups','transaction_offset_items'] LOOP
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=t AND grantee NOT IN ('postgres','authenticated','service_role') LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r.grantee);
  END LOOP;
 END LOOP;
END $$;
COMMIT;
