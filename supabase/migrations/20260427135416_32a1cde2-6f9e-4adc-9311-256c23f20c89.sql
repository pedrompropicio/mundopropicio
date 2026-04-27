-- Conceder camarim_manage ao role editor por defeito (gestão completa exceto fecho)
INSERT INTO public.role_permissions (role, permission)
VALUES ('editor', 'camarim_manage')
ON CONFLICT (role, permission) DO NOTHING;