-- 1) Coluna active_company_id em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_company ON public.profiles(active_company_id);

-- 2) Atualizar current_company_id() para suportar platform_admin com escolha
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_platform_admin boolean;
  v_company uuid;
  v_active uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role
  ) INTO v_is_platform_admin;

  SELECT company_id, active_company_id
    INTO v_company, v_active
  FROM public.profiles
  WHERE id = v_uid;

  IF v_is_platform_admin THEN
    -- platform_admin: usa active_company_id; se não definido, fallback para company_id, depois primeira ativa
    IF v_active IS NOT NULL THEN
      RETURN v_active;
    ELSIF v_company IS NOT NULL THEN
      RETURN v_company;
    ELSE
      RETURN (SELECT id FROM public.companies WHERE status='active' ORDER BY created_at LIMIT 1);
    END IF;
  ELSE
    -- Utilizador normal: SEMPRE company_id (não pode mudar)
    RETURN v_company;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

-- 3) RPC para o seletor: só platform_admin pode trocar
CREATE OR REPLACE FUNCTION public.set_active_company(target_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Only platform admins can switch active company';
  END IF;

  IF target_company_id IS NULL THEN
    UPDATE public.profiles SET active_company_id = NULL WHERE id = v_uid;
    RETURN NULL;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.companies WHERE id = target_company_id AND status = 'active'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Target company % does not exist or is not active', target_company_id;
  END IF;

  UPDATE public.profiles SET active_company_id = target_company_id WHERE id = v_uid;
  RETURN target_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_active_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_company(uuid) TO authenticated;

-- 4) RLS para profiles: garantir que user pode atualizar o próprio active_company_id (já deve poder)
-- Confirmar que existe policy de update por self
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;