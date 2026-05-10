-- Restaurar capacidade do trigger tickets_v2_sync_lot escrever no log.
-- A policy permissiva genérica foi removida na limpeza multi-tenant 2026-04-30/05-09.
-- A RESTRICTIVE company_isolation_* já garante isolamento; basta uma permissiva
-- de INSERT scoped por company_id.

DROP POLICY IF EXISTS "Sync log insertable by authenticated tenant" ON public.tickets_v2_sync_log;

CREATE POLICY "Sync log insertable by authenticated tenant"
  ON public.tickets_v2_sync_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR company_id = public.current_company_id()
    OR public.is_platform_admin()
  );