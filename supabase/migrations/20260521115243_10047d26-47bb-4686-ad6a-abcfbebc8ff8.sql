
DROP POLICY IF EXISTS "op_child_ins" ON public.operacao_registro_media;
CREATE POLICY "op_child_ins" ON public.operacao_registro_media
FOR INSERT TO authenticated
WITH CHECK (
  is_platform_admin()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'register_operacao'::text)
  OR has_permission(auth.uid(), 'open_chamado'::text)
);

DROP POLICY IF EXISTS "op_child_upd" ON public.operacao_registro_media;
CREATE POLICY "op_child_upd" ON public.operacao_registro_media
FOR UPDATE TO authenticated
USING (
  is_platform_admin()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'register_operacao'::text)
  OR has_permission(auth.uid(), 'manage_chamados'::text)
)
WITH CHECK (
  is_platform_admin()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'register_operacao'::text)
  OR has_permission(auth.uid(), 'manage_chamados'::text)
);
