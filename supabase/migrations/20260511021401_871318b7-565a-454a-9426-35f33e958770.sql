-- Fix: GRANTs em falta no schema crm + RLS via public.current_company_id()
-- Já aplicado em produção via MCP; este ficheiro versiona para sobreviver a drift correction.
--
-- Razão:
-- 1) Sem GRANT no role authenticated, qualquer query batia em "permission denied for table"
--    antes da RLS sequer ser avaliada.
-- 2) Trocar subselect direto em profiles por public.current_company_id() (SECURITY DEFINER)
--    evita RLS recursiva em profiles e mantém consistência com o resto do projeto.

-- ============================================================
-- GRANTs base
-- ============================================================
GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT, INSERT, UPDATE ON crm.oauth_states TO authenticated;
GRANT SELECT, INSERT, UPDATE ON crm.ad_platform_connections TO authenticated;

-- ============================================================
-- crm.oauth_states — políticas revisadas
-- ============================================================
DROP POLICY IF EXISTS insert_own_company ON crm.oauth_states;
DROP POLICY IF EXISTS select_own_company ON crm.oauth_states;

CREATE POLICY insert_own_company ON crm.oauth_states FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
  );

CREATE POLICY select_own_company ON crm.oauth_states FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- ============================================================
-- crm.ad_platform_connections — políticas revisadas
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON crm.ad_platform_connections;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.ad_platform_connections;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.ad_platform_connections;

CREATE POLICY tenant_isolation_select ON crm.ad_platform_connections FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.ad_platform_connections FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_update ON crm.ad_platform_connections FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());