DROP POLICY IF EXISTS "operacao_media_select" ON storage.objects;

CREATE POLICY "operacao_media_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'operacao-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_permission(auth.uid(), 'view_operacao')
    OR EXISTS (
      SELECT 1
      FROM public.operacao_registros r
      WHERE r.company_id::text = (storage.foldername(name))[1]
        AND r.id::text = (storage.foldername(name))[3]
        AND public.can_view_event_operacao(
          ((storage.foldername(name))[2])::uuid,
          auth.uid()
        )
    )
  )
);

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin'::public.app_role,'view_operacao'),
  ('admin'::public.app_role,'register_operacao'),
  ('admin'::public.app_role,'manage_operacao_frentes'),
  ('admin'::public.app_role,'manage_operacao_etapas'),
  ('admin'::public.app_role,'manage_operacao_staff'),
  ('manager'::public.app_role,'view_operacao'),
  ('manager'::public.app_role,'register_operacao'),
  ('manager'::public.app_role,'manage_operacao_frentes'),
  ('manager'::public.app_role,'manage_operacao_etapas'),
  ('manager'::public.app_role,'manage_operacao_staff'),
  ('editor'::public.app_role,'view_operacao'),
  ('editor'::public.app_role,'register_operacao'),
  ('viewer'::public.app_role,'view_operacao'),
  ('field_producer'::public.app_role,'view_operacao'),
  ('field_producer'::public.app_role,'register_operacao'),
  ('producer'::public.app_role,'view_operacao'),
  ('producer'::public.app_role,'register_operacao'),
  ('producer'::public.app_role,'manage_operacao_frentes'),
  ('producer'::public.app_role,'manage_operacao_etapas'),
  ('producer'::public.app_role,'manage_operacao_staff'),
  ('platform_admin'::public.app_role,'view_operacao'),
  ('platform_admin'::public.app_role,'register_operacao'),
  ('platform_admin'::public.app_role,'manage_operacao_frentes'),
  ('platform_admin'::public.app_role,'manage_operacao_etapas'),
  ('platform_admin'::public.app_role,'manage_operacao_staff')
ON CONFLICT (role, permission) DO NOTHING;