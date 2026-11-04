-- 0313 — #591: âmbito de empresa estrito; bypass explícito apenas para a plataforma.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Executor: E2b · Plataforma e Infra. Aplicação: 0, na janela autorizada pelo Pedro.
-- Só DDL, sem DML. Sem execução em homologação/Live nesta preparação.
-- Mantém o ramo NULL até decisão do Pedro após as contagens da prova §3.
-- CREATE OR REPLACE preserva owner/ACL e o nome do parâmetro _row_company_id.
-- Só backup_runs muda de política; help_questions permanece estrita (decisão pendente).
-- Prova de janela: docs/testes/issue591/prova-janela.sql
-- Rollback: supabase/manual/rollback_0313_issue591_row_scope_strict_comentado.sql

CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _row_company_id IS NULL OR _row_company_id = public.current_company_id()
$function$;

COMMENT ON FUNCTION public.row_belongs_to_current_company(uuid) IS
  '#591: âmbito estrito; ramo NULL mantido até decisão do Pedro';

CREATE FUNCTION public.row_belongs_to_current_company_or_platform(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin() OR public.row_belongs_to_current_company(_row_company_id)
$function$;

REVOKE ALL ON FUNCTION public.row_belongs_to_current_company_or_platform(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company_or_platform(uuid) TO authenticated, service_role;

ALTER POLICY company_isolation_backup_runs ON public.backup_runs
  USING ((company_id IS NOT NULL AND public.row_belongs_to_current_company_or_platform(company_id))
    OR (company_id IS NULL AND public.has_role(auth.uid(), 'platform_admin')));
