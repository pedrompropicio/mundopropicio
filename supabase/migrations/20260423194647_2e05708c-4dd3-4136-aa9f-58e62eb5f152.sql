-- Add 'camarim_team' permission for the dressing-room field team module
INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'camarim_team'),
  ('manager', 'camarim_team')
ON CONFLICT (role, permission) DO NOTHING;