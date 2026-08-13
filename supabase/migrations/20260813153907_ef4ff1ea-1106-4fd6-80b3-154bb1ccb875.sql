DROP POLICY IF EXISTS card_sessions_write ON public.card_sessions;

CREATE POLICY card_sessions_write ON public.card_sessions
FOR ALL TO authenticated
USING (
  can_manage_cards(auth.uid())
  AND (
    status <> 'closed'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  )
)
WITH CHECK (
  can_manage_cards(auth.uid())
);