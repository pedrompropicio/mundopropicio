-- =========================================================================
-- FASE 7 (Teste): consolidar profiles apontando à empresa real + RLS isolamento
-- =========================================================================

-- 1) Corrigir profiles que apontam para uma company_id inexistente na Teste.
--    Todos vão para a única Mundo Propício existente (975254b9-...).
UPDATE public.profiles
SET company_id = '975254b9-6b92-4cdd-a971-36e4a4f98525'::uuid
WHERE company_id NOT IN (SELECT id FROM public.companies);

-- Idem para user_roles (se a coluna existir e estiver desalinhada)
UPDATE public.user_roles
SET company_id = '975254b9-6b92-4cdd-a971-36e4a4f98525'::uuid
WHERE company_id IS NOT NULL
  AND company_id NOT IN (SELECT id FROM public.companies);

-- 2) RLS multi-tenant via policy RESTRICTIVE única por tabela.
--    Não toca nas policies PERMISSIVE existentes (papéis/permissões) — apenas
--    sobrepõe o filtro de empresa. Platform_admin escapa via current_company_id().
DO $$
DECLARE
  r record;
  tables_to_isolate text[] := ARRAY[
    'events','transactions','suppliers','financial_accounts','account_categories',
    'event_forecasts','event_dates','event_sessions','event_partners','event_partner_extras',
    'event_ticket_zones','event_ticket_lots','event_ticket_office_assignments','event_ticket_office_advances',
    'event_cache_configs','event_cache_tiers','event_cache_payments','event_cache_extras',
    'event_cache_deductions','event_cache_city_settlements','event_closing_costs',
    'event_implementations','event_forecast_partners','event_forecast_formalidade_log',
    'transaction_documents','transaction_payments','transaction_audit_log',
    'recurring_transactions','quotations','venues','venue_reservations',
    'supplier_documents','supplier_credits','supplier_credit_usages',
    'reimbursement_notes','reimbursement_note_items',
    'partner_advance_expenses','partner_paid_expenses','partner_event_access',
    'payment_lists','payment_list_items','ticket_sales','ticket_import_logs','ticket_office_settlements',
    'camarim_sessions','camarim_items','camarim_item_documents','camarim_item_reviews',
    'camarim_session_events','camarim_integrations','camarim_fund_moves',
    'bp_versions','bp_version_audit_log','bp_orphan_attachments',
    'forecast_audit_log','accounting_exports',
    'financial_account_access','user_permissions','user_activity_log',
    'push_subscriptions','company_invitations'
  ];
  tname text;
BEGIN
  FOREACH tname IN ARRAY tables_to_isolate
  LOOP
    -- só aplica se a tabela existe e tem coluna company_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tname AND column_name='company_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tname);
      EXECUTE format('DROP POLICY IF EXISTS company_isolation_%s ON public.%I', tname, tname);
      EXECUTE format(
        'CREATE POLICY company_isolation_%s ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id())',
        tname, tname
      );
      RAISE NOTICE '✅ tenant isolation aplicado em %', tname;
    ELSE
      RAISE NOTICE '⚠️ skip % (sem company_id)', tname;
    END IF;
  END LOOP;
END $$;