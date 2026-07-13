DROP POLICY IF EXISTS "Camarim session events manageable by admin or manager" ON public.camarim_session_events;
CREATE POLICY "Camarim session events manageable by editor+"
ON public.camarim_session_events FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_permission(auth.uid(), 'camarim_manage'::text)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_permission(auth.uid(), 'camarim_manage'::text)
);