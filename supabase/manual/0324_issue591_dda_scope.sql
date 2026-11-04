-- 0324 — #591 E2b: auditoria de downloads limitada à empresa activa de admin e manager.
-- Decisão do Pedro (04/11/2026): admin de uma empresa ver downloads de todas é fuga entre tenants.
-- Autorização: 6618640384; origem: resposta 6621115940, pergunta 3 (prioridade P1).
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim
-- do Pedro, pelo 0 · Cowork (mp-homolog-3 → Live).
-- Dependência recomendada: 0313 antes (só para o platform_admin); a ordem inversa é segura.
-- Sem a 0313, o rbcc capturado ainda permite todas as empresas ao platform_admin.
-- Mantém a referência a rbcc e não altera a contagem de 93 políticas da prova da 0313.
-- Só ALTER POLICY, sem DML; record_document_download e o ecrã leitor ficam intactos.
-- Rollback: supabase/manual/rollback_0324_issue591_dda_scope_comentado.sql

ALTER POLICY "dda_select_admin_manager" ON public.document_download_audit
  USING (
    (public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'manager'::app_role))
    AND public.row_belongs_to_current_company(company_id)
  );
