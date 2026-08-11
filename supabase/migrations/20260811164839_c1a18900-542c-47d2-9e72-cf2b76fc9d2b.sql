DROP POLICY IF EXISTS "Reimbursement notes viewable by privileged roles" ON public.reimbursement_notes;
CREATE POLICY "Reimbursement notes viewable by privileged roles"
ON public.reimbursement_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);

DROP POLICY IF EXISTS "Reimbursement note items viewable by privileged roles" ON public.reimbursement_note_items;
CREATE POLICY "Reimbursement note items viewable by privileged roles"
ON public.reimbursement_note_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);