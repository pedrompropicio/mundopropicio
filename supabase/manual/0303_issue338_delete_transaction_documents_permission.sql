-- 0303 — Issue #338b (Lote B, #435): permissão própria para apagar anexos de transações.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar DDL/DML.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- delete_transaction_documents: «Apagar anexos de transações», grupo Operacional.
-- Defaults admin/manager/editor; só o apagar. INSERT/UPDATE permanecem por papel.
-- Conferência Live por SELECT em 2026-11-01 (agente Lovable, só leitura):
-- role_permissions tem id uuid, role app_role, permission text, created_at timestamptz;
-- UNIQUE(role, permission), sem company_id: os defaults são globais para todas as empresas.
-- approve_transactions usa duas linhas globais, admin e manager, criadas em
-- 2026-09-02 23:14:29.00556+00; exemplos de id:
-- admin a110df1d-ed12-46a5-927f-76d41a83896b; manager aa7d8e01-fd88-401f-b7f7-cd4f7aaca539.
-- Não existem linhas de delete_transaction_documents nesta conferência.
-- user_permissions tem user_id, permission, granted e company_id; overrides por empresa
-- prevalecem nos helpers existentes. Nenhum override é criado ou alterado aqui.
-- has_permission_in(uuid,text,uuid) existe: COALESCE do override da empresa dona,
-- is_platform_admin ou user_roles da mesma empresa JOIN role_permissions por role.
-- Política DELETE atual: "Transaction docs deletable by privileged roles",
-- PERMISSIVE FOR DELETE TO authenticated, USING:
-- (has_role((SELECT auth.uid()), 'admin'::app_role)
-- OR has_role((SELECT auth.uid()), 'manager'::app_role)).
-- company_isolation_transaction_documents: RESTRICTIVE ALL TO authenticated,
-- USING e WITH CHECK company_id = current_company_id(); permanece intacta.
-- Restantes políticas SELECT/INSERT/UPDATE permanecem intactas.
-- Gate novo usa has_permission_in na empresa dona, tal como approve_transactions;
-- platform_admin é preservado explicitamente, inclusive perante override negativo.
-- A edge delete-transaction-document preserva canAccessCompany; comprovativos seguem o mesmo canDeleteIn.
-- ALL_PERMISSIONS e botão no modal são R1 #338a, executor Claude Code / Lote A.
-- Sem alteração em src/, deploy de funções ou Publish nesta preparação.
-- Rollback repõe a política anterior e remove apenas os três defaults novos;
-- não elimina overrides de utilizador eventualmente criados depois da aplicação.
-- Ficheiro escrito pelo 0 · Cowork a partir da preparação do agente Lovable (o agente recusou gravar em drizzle/migrations).

-- ROLLBACK COMENTADO — não executar nesta preparação.
-- DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON public.transaction_documents;
-- CREATE POLICY "Transaction docs deletable by privileged roles"
-- ON public.transaction_documents AS PERMISSIVE FOR DELETE TO authenticated
-- USING (
--   public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
--   OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
-- );
-- DELETE FROM public.role_permissions
-- WHERE permission = 'delete_transaction_documents'
--   AND role IN ('admin'::public.app_role, 'manager'::public.app_role, 'editor'::public.app_role);
-- Antes de retirar a permissão, repor também o gate anterior da edge (deploy pelo 0).

-- ALTERAÇÃO PREPARADA — não aplicada.
INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin'::public.app_role, 'delete_transaction_documents'),
  ('manager'::public.app_role, 'delete_transaction_documents'),
  ('editor'::public.app_role, 'delete_transaction_documents')
ON CONFLICT (role, permission) DO NOTHING;

DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON public.transaction_documents;
CREATE POLICY "Transaction docs deletable by privileged roles"
ON public.transaction_documents AS PERMISSIVE FOR DELETE TO authenticated
USING (
  public.is_platform_admin((SELECT auth.uid()))
  OR public.has_permission_in((SELECT auth.uid()), 'delete_transaction_documents', company_id)
);
