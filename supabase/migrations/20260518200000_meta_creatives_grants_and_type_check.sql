-- Sprint MCS v1 fix: versionar GRANTs aplicados manualmente em Live (17:04 BRT)
-- e type_check constraint alargado (17:12 BRT).
-- Aplicado em Live via SQL Editor durante debug Sprint MCS v1.
-- Esta migration garante zero-drift entre repo e Live.

GRANT SELECT, INSERT, UPDATE ON crm.meta_creatives TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE ON crm.meta_sync_state TO service_role, authenticated;
GRANT SELECT ON crm.meta_ad_snapshot TO service_role, authenticated;
GRANT USAGE ON SCHEMA crm TO service_role, authenticated;

ALTER TABLE crm.meta_creatives
  DROP CONSTRAINT IF EXISTS meta_creatives_type_check;

ALTER TABLE crm.meta_creatives
  ADD CONSTRAINT meta_creatives_type_check
  CHECK (type IN ('image','video','carousel','banner','unknown','collection','instant_experience'));
