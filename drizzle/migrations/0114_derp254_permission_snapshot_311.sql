CREATE TABLE public.permission_snapshot_311 (
  snapshot text NOT NULL,
  user_id uuid NOT NULL,
  company_id uuid,
  role text,
  permission text,
  taken_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.permission_snapshot_311 FROM anon, authenticated;
GRANT ALL ON public.permission_snapshot_311 TO service_role;
ALTER TABLE public.permission_snapshot_311 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.permission_snapshot_311 IS '#311 F2a: fotografia antes/depois do acesso efectivo por utilizador x empresa. Só service_role.';