DROP POLICY IF EXISTS "Reimbursement notes viewable by privileged roles" ON public.reimbursement_notes;

CREATE POLICY "Reimbursement notes viewable by admin or manager"
ON public.reimbursement_notes
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);