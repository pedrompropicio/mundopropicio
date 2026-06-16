-- Garante que o bucket de Storage `crm-meta-creatives` mantém public=true.
--
-- ⚠️ Não é aplicado automaticamente pelo runner de migrações da Lovable
--    (SQL em storage.buckets está bloqueado por ambos os tools).
--    Correr manualmente no SQL Editor de Live após cada Publish em que
--    o bucket tenha sido revertido para private.
--
-- Em Test usa-se o tool supabase--storage_update_bucket; em Live correr este
-- SQL no dashboard quando necessário.

UPDATE storage.buckets
SET public = true
WHERE id = 'crm-meta-creatives'
  AND public IS DISTINCT FROM true;
