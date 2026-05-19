-- a) profile_type
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'user'
  CHECK (profile_type IN ('user', 'field_staff'));
CREATE INDEX IF NOT EXISTS idx_profiles_profile_type ON public.profiles(profile_type);

-- b) archived_at
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_archived_at ON public.profiles(archived_at);

-- c) (skipped) profiles.id é FK directa a auth.users(id) — não existe coluna user_id.
-- Implicação: o auth.users é criado imediatamente no momento de cadastrar o staff
-- (phone-only, sem confirmar). Documentado no edge function create-staff.

-- d) Tabela de convites
CREATE TABLE IF NOT EXISTS public.operacao_staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  created_by_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  sent_at timestamptz,
  send_count int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_op_invites_profile ON public.operacao_staff_invites(profile_id);
CREATE INDEX IF NOT EXISTS idx_op_invites_token ON public.operacao_staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_op_invites_status ON public.operacao_staff_invites(status);

ALTER TABLE public.operacao_staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_staff_invites FORCE ROW LEVEL SECURITY;

-- Permissão
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','manage_operacao_staff'),
  ('manager','manage_operacao_staff')
ON CONFLICT DO NOTHING;

-- RLS
CREATE POLICY "op_staff_invites_select"
  ON public.operacao_staff_invites FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_staff') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "op_staff_invites_insert"
  ON public.operacao_staff_invites FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_staff') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "op_staff_invites_update"
  ON public.operacao_staff_invites FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_staff') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_staff') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "op_staff_invites_delete"
  ON public.operacao_staff_invites FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_staff') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "company_isolation_operacao_staff_invites"
  ON public.operacao_staff_invites AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()));

-- Audit trigger
CREATE TRIGGER audit_operacao_staff_invites_changes
AFTER INSERT OR UPDATE OR DELETE ON public.operacao_staff_invites
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();