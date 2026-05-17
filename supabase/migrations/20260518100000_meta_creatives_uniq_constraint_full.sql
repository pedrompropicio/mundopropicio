-- Sprint MCS v1 fix: substituir UNIQUE partial por UNIQUE total.
-- Motivo: supabase-js .upsert(onConflict) não aceita partial index
-- como conflict target (Postgres erro 42P10).
-- NULLs são distintos por defeito em Postgres, preservando rows legacy.

DROP INDEX IF EXISTS crm.meta_creatives_company_meta_creative_uniq;

ALTER TABLE crm.meta_creatives
  ADD CONSTRAINT meta_creatives_company_meta_creative_uniq
  UNIQUE (company_id, meta_creative_id);

COMMENT ON CONSTRAINT meta_creatives_company_meta_creative_uniq ON crm.meta_creatives IS
  'UNIQUE total (company_id, meta_creative_id). NULLs distintos por defeito (Postgres), preservando uploads UI legacy sem meta_creative_id.';
