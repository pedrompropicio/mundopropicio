ALTER TABLE crm.google_publish_plan
  ADD COLUMN IF NOT EXISTS eu_political_advertising text NOT NULL
    DEFAULT 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';

ALTER TABLE crm.google_publish_plan
  DROP CONSTRAINT IF EXISTS google_publish_plan_eu_par_chk;

ALTER TABLE crm.google_publish_plan
  ADD CONSTRAINT google_publish_plan_eu_par_chk
  CHECK (eu_political_advertising IN (
    'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    'CONTAINS_EU_POLITICAL_ADVERTISING'
  ));

COMMENT ON COLUMN crm.google_publish_plan.eu_political_advertising IS
  'Auto-declaracao EU PAR enviada como Campaign.contains_eu_political_advertising.';