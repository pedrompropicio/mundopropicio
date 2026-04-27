DROP POLICY IF EXISTS "Camarim sessions manageable by admin or manager" ON public.camarim_sessions;
CREATE POLICY "Camarim sessions manageable by admin or manager"
ON public.camarim_sessions
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'camarim_manage')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'camarim_manage')
);

DROP POLICY IF EXISTS "Camarim items manageable by admin or manager" ON public.camarim_items;
CREATE POLICY "Camarim items manageable by admin or manager"
ON public.camarim_items
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'camarim_manage')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'camarim_manage')
);