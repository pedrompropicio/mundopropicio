DROP POLICY IF EXISTS "Camarim fund moves manageable by admin or manager" ON public.camarim_fund_moves;
CREATE POLICY "Camarim fund moves manageable by admin, manager or camarim_manage"
ON public.camarim_fund_moves
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'manager'::app_role)
   OR has_permission(auth.uid(), 'camarim_manage'))
  AND EXISTS (
    SELECT 1 FROM camarim_sessions s
    WHERE s.id = camarim_fund_moves.session_id
      AND s.status <> 'integrated'
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'manager'::app_role)
   OR has_permission(auth.uid(), 'camarim_manage'))
  AND EXISTS (
    SELECT 1 FROM camarim_sessions s
    WHERE s.id = camarim_fund_moves.session_id
      AND s.status <> 'integrated'
  )
);