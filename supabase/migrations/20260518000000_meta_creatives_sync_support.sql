-- Sprint Meta Creatives Sync v1 — schema support
--
-- Razão: crm.meta_creatives foi originalmente desenhada apenas para
-- uploads via UI manual (/audience/creatives/new). Com o sync da Meta
-- Graph API, criativos sincronizados não têm storage no bucket Supabase
-- (storage_path, file_url) nem user explícito (created_by quando cron).
-- Estas constraints bloqueavam o INSERT do sync.
-- Relaxamos sem impactar uploads UI (que continuam a popular estes campos).

ALTER TABLE crm.meta_creatives ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE crm.meta_creatives ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE crm.meta_creatives ALTER COLUMN created_by DROP NOT NULL;

-- UNIQUE partial em (company_id, meta_creative_id) — necessário para
-- upsert idempotente do sync. Partial porque uploads UI antigos têm
-- meta_creative_id = NULL (múltiplos NULLs são permitidos pelo Postgres
-- com índice parcial WHERE meta_creative_id IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS meta_creatives_company_meta_creative_uniq
  ON crm.meta_creatives (company_id, meta_creative_id)
  WHERE meta_creative_id IS NOT NULL;

-- Comentários para futuros maintainers
COMMENT ON COLUMN crm.meta_creatives.storage_path IS
  'NULL quando criativo veio de sync da Meta Graph API (sem upload). Populated apenas via /audience/creatives/new (UI manual).';
COMMENT ON COLUMN crm.meta_creatives.file_url IS
  'NULL quando criativo veio de sync da Meta Graph API. Sprint MCS v2 popula via resolução de meta_image_hash.';
COMMENT ON COLUMN crm.meta_creatives.created_by IS
  'NULL quando criativo veio de sync via cron (service_role). User UUID quando criativo veio de upload manual ou trigger user-authenticated do sync.';
