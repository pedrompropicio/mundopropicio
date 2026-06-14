-- Reverter google_conversion_dedup_uidx: era redundante face ao
-- uq_google_conversion_order já existente (mesmas colunas). O onConflict
-- por colunas no upsert continua a casar com o índice antigo.
DROP INDEX IF EXISTS crm.google_conversion_dedup_uidx;