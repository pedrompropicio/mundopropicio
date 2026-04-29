-- Fase 2F: Multi-tenant para Sistema, Comercial, Comunicações e Catálogos (15 tabelas)

-- 1) Adicionar company_id
ALTER TABLE public.trash ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.undo_actions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.user_activity_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.venue_reservations ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.accounting_exports ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.email_send_state ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.email_unsubscribe_tokens ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.suppressed_emails ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.account_categories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_trash_company ON public.trash(company_id);
CREATE INDEX IF NOT EXISTS idx_undo_actions_company ON public.undo_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_company ON public.system_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_company ON public.user_activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_venue_reservations_company ON public.venue_reservations(company_id);
CREATE INDEX IF NOT EXISTS idx_accounting_exports_company ON public.accounting_exports(company_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_company ON public.email_send_log(company_id);
CREATE INDEX IF NOT EXISTS idx_email_send_state_company ON public.email_send_state(company_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_company ON public.email_unsubscribe_tokens(company_id);
CREATE INDEX IF NOT EXISTS idx_suppressed_emails_company ON public.suppressed_emails(company_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company ON public.push_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_account_categories_company ON public.account_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_venues_company ON public.venues(company_id);

-- 3) Seed para Mundo Propício
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mundo-propicio' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa mundo-propicio não encontrada';
  END IF;

  UPDATE public.trash SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.undo_actions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.system_audit_log SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.user_activity_log SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.quotations SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.venue_reservations SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.accounting_exports SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.email_send_log SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.email_send_state SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.email_unsubscribe_tokens SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.suppressed_emails SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.push_subscriptions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.account_categories SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.venues SET company_id = v_company_id WHERE company_id IS NULL;
END $$;

-- 4) RLS RESTRICTIVE policies + 5) Trigger BEFORE INSERT
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'trash','undo_actions','system_audit_log','user_activity_log',
    'quotations','venue_reservations','accounting_exports',
    'email_send_log','email_send_state','email_unsubscribe_tokens','suppressed_emails','push_subscriptions',
    'account_categories','venues'
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