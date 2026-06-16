-- 1) default_tab no acesso por evento
ALTER TABLE public.partner_event_access
  ADD COLUMN IF NOT EXISTS default_tab text NOT NULL DEFAULT 'bp'
    CHECK (default_tab IN ('bp','tickets','transactions'));

-- 2) Baseline role_permissions do parceiro (idempotente)
INSERT INTO public.role_permissions (role, permission)
SELECT 'partner'::app_role, perm
FROM (VALUES ('view_events'), ('view_bp'), ('view_report_dre')) AS v(perm)
ON CONFLICT DO NOTHING;

-- 3) RLS reforço: transactions partner exige capability
DROP POLICY IF EXISTS transactions_select_partner ON public.transactions;
CREATE POLICY transactions_select_partner ON public.transactions
  FOR SELECT TO authenticated
  USING (
    event_id IS NOT NULL
    AND user_has_event_access(auth.uid(), event_id)
    AND public.has_permission(auth.uid(), 'view_partner_transactions')
  );

-- 4) RLS reforço: transaction_documents partner exige capability
DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;
CREATE POLICY transaction_documents_select_partner ON public.transaction_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_documents.transaction_id
        AND t.event_id IS NOT NULL
        AND user_has_event_access(auth.uid(), t.event_id)
    )
    AND public.has_permission(auth.uid(), 'view_partner_documents')
  );

-- 5) RLS reforço: event_forecasts UPDATE partner exige capability + scope
DROP POLICY IF EXISTS event_forecasts_update_partner ON public.event_forecasts;
CREATE POLICY event_forecasts_update_partner ON public.event_forecasts
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'edit_approved_bp')
    AND EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = auth.uid()
        AND pea.event_id = event_forecasts.event_id
        AND pea.is_active = true
        AND pea.can_edit_bp = true
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'edit_approved_bp')
    AND EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = auth.uid()
        AND pea.event_id = event_forecasts.event_id
        AND pea.is_active = true
        AND pea.can_edit_bp = true
    )
    AND company_id = current_company_id()
  );