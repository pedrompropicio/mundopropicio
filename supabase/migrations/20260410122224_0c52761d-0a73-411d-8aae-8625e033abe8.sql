-- INSERT policy
CREATE POLICY "Authenticated users can insert supplier credits"
ON public.supplier_credits FOR INSERT TO authenticated
WITH CHECK (true);

-- SELECT policy
CREATE POLICY "Authenticated users can view supplier credits"
ON public.supplier_credits FOR SELECT TO authenticated
USING (true);

-- UPDATE policy
CREATE POLICY "Authenticated users can update supplier credits"
ON public.supplier_credits FOR UPDATE TO authenticated
USING (true);

-- DELETE policy (admin/manager only)
CREATE POLICY "Admins and managers can delete supplier credits"
ON public.supplier_credits FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);