-- 0326 — #591: linhas sem empresa deixam de pertencer ao âmbito de empresa.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização: 6618640384; decisão do Pedro: 6631476546 (04/11/2026).
-- Executor: E2b · Plataforma e Infra. Aplicação: 0, em janela autorizada.
-- Ordem: depois da 0313 (e da 0324); preserva assinatura, owner e ACL, sem GRANT/REVOKE.
-- Só DDL preparado; sem execução em homologação/Live, sem deploy ou DML.
-- Prova antes/depois: docs/testes/issue591/prova-janela-0326-null.sql
-- Rollback: supabase/manual/rollback_0326_issue591_rbcc_sem_ramo_null_comentado.sql

-- §1 — NULL é sempre false, incluindo quando não há empresa activa.
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(_row_company_id = public.current_company_id(), false)
$function$;

COMMENT ON FUNCTION public.row_belongs_to_current_company(uuid) IS
  '#591 / 0326: âmbito da empresa activa; NULL devolve false; acesso global só por política explícita';

-- §2 — Conservar a composição PERMISSIVE/RESTRICTIVE e o âmbito de linhas com empresa.
-- sync_runs: PERMISSIVE SELECT era rbcc; conservar NULL só para platform_admin.
ALTER POLICY sync_runs_select_authenticated ON public.sync_runs
  USING (public.row_belongs_to_current_company(company_id)
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

-- system_audit_log: a PERMISSIVE SELECT já exclui NULL para os restantes perfis.
-- A RESTRICTIVE também tem de deixar passar NULL do platform_admin, sem alargar X/Y.
-- O default current_company_id() preserva o insert de src/lib/audit.ts com empresa activa.
ALTER POLICY company_isolation_system_audit_log ON public.system_audit_log
  USING (public.row_belongs_to_current_company(company_id)
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')))
  WITH CHECK (public.row_belongs_to_current_company(company_id)
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

-- system_reminders: retirar o bypass NULL incondicional nos dois predicados.
ALTER POLICY system_reminders_company_isolation ON public.system_reminders
  USING (public.row_belongs_to_current_company(company_id)
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')))
  WITH CHECK (public.row_belongs_to_current_company(company_id)
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

-- email_send_log: sem ALTER; a única PERMISSIVE SELECT exige auth.role()='service_role'.
-- Nenhum authenticated, incluindo platform_admin, lê linhas antes ou depois.
-- §3 — Nenhuma outra política muda; backup_runs conserva a política da 0313.
