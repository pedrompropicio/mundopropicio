
-- ═══════════════════════════════════════════════════════════════════════════════
-- MULTI-MEMBERSHIP: 1 user → N empresas com role/permissão independentes por empresa
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── F1.A schema: UNIQUE compostos por (user_id, company_id, ...) ──
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_company_role_key UNIQUE (user_id, company_id, role);

ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_permission_key;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_company_permission_key UNIQUE (user_id, company_id, permission);

-- ── F1.B profiles.company_id NULLABLE (passa a ser apenas empresa "principal" / fallback) ──
ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;

-- ── F1.C VIEW user_companies (catálogo de memberships) ──
CREATE OR REPLACE VIEW public.user_companies
WITH (security_invoker = true)
AS
SELECT DISTINCT
  ur.user_id,
  ur.company_id,
  c.display_name,
  c.slug,
  c.logo_url,
  c.status,
  -- role "principal" do user nessa empresa (priorização menor índice = mais alta)
  (SELECT ur2.role FROM public.user_roles ur2
     WHERE ur2.user_id = ur.user_id AND ur2.company_id = ur.company_id
     ORDER BY CASE ur2.role::text
       WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
       WHEN 'editor' THEN 3 WHEN 'partner' THEN 4 WHEN 'viewer' THEN 5
       WHEN 'marketing_manager' THEN 5 WHEN 'user' THEN 6 ELSE 99 END
     LIMIT 1) AS primary_role
FROM public.user_roles ur
JOIN public.companies c ON c.id = ur.company_id
WHERE ur.user_id = auth.uid()
  AND c.status = 'active';

GRANT SELECT ON public.user_companies TO authenticated;

-- ── F2.A has_role tenant-aware (mantém platform_admin global) ──
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (
        _role = 'platform_admin'::app_role
        OR company_id = public.current_company_id()
      )
  )
$$;

-- ── F2.B has_permission tenant-aware ──
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    -- override per-user na empresa ativa
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission
         AND company_id = public.current_company_id()
       LIMIT 1),
    -- fallback: role na empresa ativa (ou platform_admin global)
    (SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id
        AND rp.permission = _permission
        AND (ur.role = 'platform_admin'::app_role OR ur.company_id = public.current_company_id())
    ))
  )
$$;

-- ── F2.C helpers explícitos (para uso futuro) ──
CREATE OR REPLACE FUNCTION public.has_role_in(_user_id uuid, _role app_role, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND company_id = _company_id)
$$;

CREATE OR REPLACE FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission AND company_id = _company_id LIMIT 1),
    (SELECT EXISTS (SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       WHERE ur.user_id = _user_id AND rp.permission = _permission AND ur.company_id = _company_id))
  )
$$;

-- ── F2.D current_company_id: multi-empresa para TODOS ──
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_company uuid;
  v_is_pa boolean;
  v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT active_company_id, company_id INTO v_active, v_company
    FROM public.profiles WHERE id = v_uid;

  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;

  -- 1) active_company_id válido (platform_admin OU user tem membership lá)
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN
      RETURN v_active;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;

  -- 2) fallback: profiles.company_id se ainda tem membership lá
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles
        WHERE user_id = v_uid AND company_id = v_company) THEN
      RETURN v_company;
    END IF;
  END IF;

  -- 3) fallback: primeira empresa onde tem membership
  RETURN (SELECT ur.company_id FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active'
    ORDER BY ur.created_at LIMIT 1);
END;
$$;

-- ── F2.E set_active_company permite a QUALQUER user com membership ──
CREATE OR REPLACE FUNCTION public.set_active_company(target_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF target_company_id IS NULL THEN
    UPDATE public.profiles SET active_company_id = NULL WHERE id = v_uid;
    RETURN NULL;
  END IF;

  -- platform_admin pode trocar para qualquer empresa ativa
  IF public.is_platform_admin(v_uid) THEN
    SELECT EXISTS(SELECT 1 FROM public.companies
      WHERE id = target_company_id AND status='active') INTO v_ok;
  ELSE
    -- restantes: tem que ter membership lá
    SELECT EXISTS(SELECT 1 FROM public.user_roles ur
      JOIN public.companies c ON c.id = ur.company_id
      WHERE ur.user_id = v_uid AND ur.company_id = target_company_id
        AND c.status='active') INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'No membership in target company %', target_company_id;
  END IF;

  UPDATE public.profiles SET active_company_id = target_company_id WHERE id = v_uid;
  RETURN target_company_id;
END;
$$;

-- ── F2.F companies RLS: também ler empresas onde user tem membership ──
DROP POLICY IF EXISTS "Users see their own company" ON public.companies;
CREATE POLICY "Users see their member companies"
ON public.companies FOR SELECT
USING (
  is_platform_admin()
  OR id = current_company_id()
  OR EXISTS (SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.company_id = companies.id)
);

-- ── F4 BACKFILL ──
-- Garantir que cada profile com company_id tem pelo menos um user_role nessa empresa
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT p.id, 'user'::app_role, p.company_id
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.company_id = p.company_id
  )
ON CONFLICT DO NOTHING;

-- Definir active_company_id := company_id quando NULL e existe membership
UPDATE public.profiles p
SET active_company_id = p.company_id
WHERE p.active_company_id IS NULL
  AND p.company_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.company_id = p.company_id);
