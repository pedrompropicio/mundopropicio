ALTER TABLE public.system_audit_log ALTER COLUMN company_id DROP NOT NULL;
-- default current_company_id() mantém-se: utilizadores autenticados continuam a preencher.
DROP TRIGGER IF EXISTS trg_set_company_id ON public.system_audit_log;
DROP POLICY IF EXISTS "System audit log viewable by admin or manager" ON public.system_audit_log;
CREATE POLICY "System audit log viewable by admin or manager" ON public.system_audit_log FOR SELECT TO authenticated USING ((has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role)) AND (company_id IS NOT NULL OR public.is_platform_admin()));
COMMENT ON COLUMN public.system_audit_log.company_id IS 'Nullable por decisão de 16/09/2026 (#86, opção B): eventos de segurança gravados por service_role (check-login-rate) nascem sem contexto de empresa. Linhas com NULL só são visíveis a platform_admin. Única tabela sem trg_set_company_id por desenho.';