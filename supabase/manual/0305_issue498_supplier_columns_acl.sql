-- 0305 — Issue #498: leitura das colunas novas de fornecedores (0302) e contas (0303).
-- Data: 2026-11-03. Classe R2. PREPARAÇÃO: só ficheiros, sem executar SQL/deploy.
-- Aplicação: janela Claude, PROC-promocao, com «Sim» do Pedro, depois da 0304.
-- CONFERÊNCIA DO HISTÓRICO LOCAL (não é uma consulta a Live):
-- supabase/migrations/20260819174233_d18ca020-c68d-4cb5-8868-bc3ea9f550c4.sql:
--   REVOKE SELECT ON public.suppliers FROM authenticated/anon; GRANT SELECT das
--   16 colunas cadastrais só a authenticated; GRANT ALL da tabela a service_role.
--   public.get_supplier_bank_details(uuid[]) RETURNS TABLE enumera apenas
--   id/name/nif e os seis campos IBAN/SWIFT; EXECUTE concedido a authenticated.
--   public.can_view_supplier_bank_data() permite admin/platform_admin/manager/
--   editor/accountant; a RPC filtra também por current_company_id() e pelos IDs.
-- supabase/migrations/20260820110300_8d3e952c-1cd0-4229-9ecc-f022a95904a8.sql:
--   repete o REVOKE/GRANT SELECT nominal das 16 colunas de public.suppliers.
-- supabase/migrations/20260820123647_3c8bae6d-6f1b-424d-afb9-182fabf93183.sql:
--   revoga SELECT dos seis campos bancários; comentário da política
--   "Suppliers viewable by tenant members" exige a RPC e proíbe GRANT da tabela.
-- 0302_issue403_supplier_foreign_accounts.sql adiciona as três colunas sem GRANT.
-- 0303_issue498_payment_methods_br.sql adiciona financial_accounts.bank_details_br.
-- Para financial_accounts não há REVOKE por coluna no histórico local; a política
-- "Financial accounts viewable by authorized users" (última definição local em
-- supabase/migrations/20260911000848_829d57de-eff8-4584-96e2-db36cc0888fa.sql)
-- é TO authenticated e mantém as guardas de empresa/conta restrita/permissão.
-- ALTERAÇÃO MÍNIMA: campos fiscais seguem o nif (SELECT cadastral authenticated);
-- foreign_bank_accounts segue exclusivamente a RPC bancária, sem GRANT direto;
-- bank_details_br tem GRANT só a authenticated, exigindo acesso prévio ao iban.
-- service_role já lê suppliers por GRANT ALL; os grants de tabela já existentes
-- em financial_accounts abrangem a nova coluna automaticamente, sem novos papéis.
-- Nenhuma política, dado operacional ou writer é alterado. Owner e privilégios
-- EXECUTE/grant options da RPC são capturados e repostos, sem herdar novos defaults.
-- A UI BR de PR #513 ainda faz SELECT direto de foreign_bank_accounts: fica
-- indisponível até um despacho R1 ligar esse leitor à RPC; não abrir a coluna
-- a todos os membros do tenant para contornar esse consumidor fora do âmbito.
BEGIN;
-- Falhar fechado se os leitores de referência diferirem do histórico esperado.
DO $preflight$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.suppliers', 'nif', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.financial_accounts', 'iban', 'SELECT')
     OR NOT has_function_privilege('authenticated', 'public.get_supplier_bank_details(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_supplier_bank_details(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION '0305: ACL de referência diverge; conferir antes de aplicar';
  END IF;
END;
$preflight$;
-- A mudança de RETURNS TABLE não é permitida por CREATE OR REPLACE isolado.
-- Capturar owner/ACL antes de DROP RESTRICT; dependências inesperadas abortam tudo.
CREATE TEMP TABLE issue498_supplier_rpc_acl ON COMMIT DROP AS
SELECT proowner, proacl
FROM pg_proc WHERE oid = 'public.get_supplier_bank_details(uuid[])'::regprocedure;
DROP FUNCTION public.get_supplier_bank_details(uuid[]) RESTRICT;
CREATE OR REPLACE FUNCTION public.get_supplier_bank_details(p_supplier_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  nif text,
  iban text,
  swift_bic text,
  iban_2 text,
  swift_bic_2 text,
  iban_3 text,
  swift_bic_3 text,
  foreign_bank_accounts jsonb,
  tax_id_foreign text,
  tax_id_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.nif, s.iban, s.swift_bic, s.iban_2, s.swift_bic_2, s.iban_3, s.swift_bic_3,
         s.foreign_bank_accounts, s.tax_id_foreign, s.tax_id_type
    FROM public.suppliers s
   WHERE public.can_view_supplier_bank_data()
     AND s.company_id = public.current_company_id()
     AND (p_supplier_ids IS NULL OR s.id = ANY (p_supplier_ids));
$$;

-- Fechar também os grants nominais/defaults antes de repor a ACL capturada.
REVOKE EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) TO service_role;
DO $restore_acl$
DECLARE
  v_owner oid;
  v_acl aclitem[];
  v_grant record;
BEGIN
  SELECT proowner, proacl INTO STRICT v_owner, v_acl FROM pg_temp.issue498_supplier_rpc_acl;
  -- Retirar todos os defaults da recriação, incluindo papéis locais adicionais.
  FOR v_grant IN
    SELECT DISTINCT a.grantee
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.get_supplier_bank_details(uuid[])'::regprocedure
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM %s',
      CASE WHEN v_grant.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END);
  END LOOP;
  EXECUTE format('ALTER FUNCTION public.get_supplier_bank_details(uuid[]) OWNER TO %I', pg_get_userbyid(v_owner));
  FOR v_grant IN
    SELECT * FROM aclexplode(coalesce(v_acl, acldefault('f', v_owner)))
  LOOP
    EXECUTE format('GRANT %s ON FUNCTION public.get_supplier_bank_details(uuid[]) TO %s%s',
      v_grant.privilege_type,
      CASE WHEN v_grant.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END,
      CASE WHEN v_grant.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END;
$restore_acl$;
GRANT SELECT (tax_id_foreign, tax_id_type) ON public.suppliers TO authenticated;
GRANT SELECT (bank_details_br) ON public.financial_accounts TO authenticated;
COMMIT;

-- ROLLBACK COMENTADO — só após revisão/autorização; não apaga colunas ou dados.
-- BEGIN;
-- -- A mudança de RETURNS TABLE não é permitida por CREATE OR REPLACE isolado.
-- -- Capturar owner/ACL antes de DROP RESTRICT; dependências inesperadas abortam tudo.
-- CREATE TEMP TABLE issue498_supplier_rpc_acl ON COMMIT DROP AS
-- SELECT proowner, proacl
-- FROM pg_proc WHERE oid = 'public.get_supplier_bank_details(uuid[])'::regprocedure;
-- DROP FUNCTION public.get_supplier_bank_details(uuid[]) RESTRICT;
-- CREATE OR REPLACE FUNCTION public.get_supplier_bank_details(p_supplier_ids uuid[] DEFAULT NULL)
-- RETURNS TABLE (
--   id uuid,
--   name text,
--   nif text,
--   iban text,
--   swift_bic text,
--   iban_2 text,
--   swift_bic_2 text,
--   iban_3 text,
--   swift_bic_3 text
-- )
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
--   SELECT s.id, s.name, s.nif, s.iban, s.swift_bic, s.iban_2, s.swift_bic_2, s.iban_3, s.swift_bic_3
--     FROM public.suppliers s
--    WHERE public.can_view_supplier_bank_data()
--      AND s.company_id = public.current_company_id()
--      AND (p_supplier_ids IS NULL OR s.id = ANY (p_supplier_ids));
-- $$;
--
-- -- Fechar também os grants nominais/defaults antes de repor a ACL capturada.
-- REVOKE EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) TO service_role;
-- DO $restore_acl$
-- DECLARE
--   v_owner oid;
--   v_acl aclitem[];
--   v_grant record;
-- BEGIN
--   SELECT proowner, proacl INTO STRICT v_owner, v_acl FROM pg_temp.issue498_supplier_rpc_acl;
--   -- Retirar todos os defaults da recriação, incluindo papéis locais adicionais.
--   FOR v_grant IN
--     SELECT DISTINCT a.grantee
--     FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--     WHERE p.oid = 'public.get_supplier_bank_details(uuid[])'::regprocedure
--   LOOP
--     EXECUTE format('REVOKE ALL ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM %s',
--       CASE WHEN v_grant.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END);
--   END LOOP;
--   EXECUTE format('ALTER FUNCTION public.get_supplier_bank_details(uuid[]) OWNER TO %I', pg_get_userbyid(v_owner));
--   FOR v_grant IN
--     SELECT * FROM aclexplode(coalesce(v_acl, acldefault('f', v_owner)))
--   LOOP
--     EXECUTE format('GRANT %s ON FUNCTION public.get_supplier_bank_details(uuid[]) TO %s%s',
--       v_grant.privilege_type,
--       CASE WHEN v_grant.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END,
--       CASE WHEN v_grant.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
--   END LOOP;
-- END;
-- $restore_acl$;
-- REVOKE SELECT (tax_id_foreign, tax_id_type) ON public.suppliers FROM authenticated;
-- REVOKE SELECT (bank_details_br) ON public.financial_accounts FROM authenticated;
-- COMMIT;
