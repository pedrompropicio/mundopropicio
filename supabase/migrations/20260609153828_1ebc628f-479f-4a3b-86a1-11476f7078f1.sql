DROP POLICY IF EXISTS "Suppliers viewable by tenant members" ON public.suppliers;
CREATE POLICY "Suppliers viewable by tenant members" ON public.suppliers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'marketing_manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR has_role(auth.uid(), 'producer'::app_role)
  OR has_role(auth.uid(), 'field_producer'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);