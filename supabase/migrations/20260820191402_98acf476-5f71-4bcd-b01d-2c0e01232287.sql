DROP POLICY IF EXISTS "Transaction docs viewable by authenticated" ON public.transaction_documents;

CREATE POLICY "transaction_documents_select_privileged_roles"
ON public.transaction_documents
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);