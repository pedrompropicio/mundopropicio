
-- =========================================================================
-- HARDENING: substituir USING (true) por validação explícita de auth
-- =========================================================================
-- A camada RESTRICTIVE company_isolation_<tabela> continua a aplicar-se
-- por cima destas policies PERMISSIVE (RLS combina PERMISSIVE OR... AND RESTRICTIVE).

-- Helper: substitui uma policy SELECT preservando o nome
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND permissive='PERMISSIVE'
      AND qual='true'
      AND cmd='SELECT'
      AND tablename <> 'profiles'  -- profiles tratado separadamente abaixo
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- Também o INSERT em event_forecast_formalidade_log com WITH CHECK (true)
DROP POLICY IF EXISTS "Authenticated users can insert formalidade log" ON public.event_forecast_formalidade_log;
CREATE POLICY "Authenticated users can insert formalidade log"
ON public.event_forecast_formalidade_log
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================================
-- PROFILES: filtrar por company_id (multi-tenant hardening)
-- =========================================================================
-- Antes: qualquer authenticated user via TODOS os profiles (emails+nomes)
-- Depois: vê só (a) o próprio, (b) profiles da mesma empresa, (c) tudo se for platform_admin

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users view profiles in their company"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR (
    company_id IS NOT NULL
    AND company_id = public.current_company_id()
  )
);
