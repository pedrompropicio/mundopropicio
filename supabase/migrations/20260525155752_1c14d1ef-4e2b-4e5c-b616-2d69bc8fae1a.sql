DROP POLICY IF EXISTS "Suppliers viewable by admin or manager" ON public.suppliers;

CREATE POLICY "Suppliers viewable by tenant members"
ON public.suppliers FOR SELECT
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'manager'::app_role)
  OR has_role(auth.uid(),'marketing_manager'::app_role)
  OR has_role(auth.uid(),'editor'::app_role)
  OR has_role(auth.uid(),'viewer'::app_role)
  OR has_role(auth.uid(),'producer'::app_role)
  OR has_role(auth.uid(),'field_producer'::app_role)
);