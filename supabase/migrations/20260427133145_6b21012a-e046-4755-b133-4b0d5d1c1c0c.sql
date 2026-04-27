INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin', 'camarim_manage'),
  ('manager', 'camarim_manage')
ON CONFLICT (role, permission) DO NOTHING;