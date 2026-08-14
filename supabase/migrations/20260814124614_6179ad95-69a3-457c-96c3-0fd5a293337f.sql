ALTER TABLE public.partner_paid_expenses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.partner_paid_expenses
  ADD CONSTRAINT partner_paid_expenses_status_check
  CHECK (status IN ('approved', 'pending_approval'));

DROP POLICY IF EXISTS "Admins and managers can insert partner paid expenses" ON public.partner_paid_expenses;

CREATE POLICY "ppe_insert_admin_manager"
ON public.partner_paid_expenses FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "ppe_insert_editor_pending"
ON public.partner_paid_expenses FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'editor'::app_role)
  AND status = 'pending_approval'
  AND proposed_by = auth.uid()
);

CREATE POLICY "ppe_update_admin_manager"
ON public.partner_paid_expenses FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "ppe_delete_editor_own_pending"
ON public.partner_paid_expenses FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'editor'::app_role)
  AND status = 'pending_approval'
  AND proposed_by = auth.uid()
);