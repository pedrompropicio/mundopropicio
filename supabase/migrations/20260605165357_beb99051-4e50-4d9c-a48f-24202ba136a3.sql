-- Alargar INSERT/UPDATE em suppliers a editor (mantendo admin/manager)
DROP POLICY IF EXISTS "Suppliers insertable by admin or manager" ON public.suppliers;
DROP POLICY IF EXISTS "Suppliers updatable by admin or manager" ON public.suppliers;

CREATE POLICY "Suppliers insertable by admin, manager or editor"
  ON public.suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  );

CREATE POLICY "Suppliers updatable by admin, manager or editor"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  );

-- DELETE continua restrita a admin/manager (não tocar)
-- RESTRICTIVE company_isolation_suppliers continua a impor company_id = current_company_id()