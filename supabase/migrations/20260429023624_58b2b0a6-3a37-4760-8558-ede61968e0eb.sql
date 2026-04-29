-- Fase 2E: Multi-tenant para Suporte Financeiro (10 tabelas)

-- 1) Adicionar company_id
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.supplier_documents ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.supplier_credits ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.supplier_credit_usages ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.reimbursement_notes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.reimbursement_note_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.partner_event_access ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_company ON public.supplier_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credits_company ON public.supplier_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_usages_company ON public.supplier_credit_usages(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_company ON public.financial_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_account_access_company ON public.financial_account_access(company_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_notes_company ON public.reimbursement_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_note_items_company ON public.reimbursement_note_items(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_paid_expenses_company ON public.partner_paid_expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_event_access_company ON public.partner_event_access(company_id);

-- 3) Seed para Mundo Propício
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mundo-propicio' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa mundo-propicio não encontrada';
  END IF;

  UPDATE public.suppliers SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.supplier_documents SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.supplier_credits SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.supplier_credit_usages SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.financial_accounts SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.financial_account_access SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.reimbursement_notes SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.reimbursement_note_items SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.partner_paid_expenses SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.partner_event_access SET company_id = v_company_id WHERE company_id IS NULL;
END $$;

-- 4) RLS RESTRICTIVE policies + 5) Trigger BEFORE INSERT
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'suppliers','supplier_documents','supplier_credits','supplier_credit_usages',
    'financial_accounts','financial_account_access',
    'reimbursement_notes','reimbursement_note_items',
    'partner_paid_expenses','partner_event_access'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_%I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "company_isolation_%I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))',
      t, t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS set_company_id_trigger ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_company_id_trigger BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      t
    );
  END LOOP;
END $$;