-- D-ERP177 adenda: já aplicado em Live a 06/10 pelo Pedro; registo idempotente.
ALTER TABLE crm.ad_platform_connections DROP CONSTRAINT IF EXISTS ad_platform_connections_token_type_check;
ALTER TABLE crm.ad_platform_connections ADD CONSTRAINT ad_platform_connections_token_type_check
  CHECK (token_type IS NULL OR token_type IN ('system_user','long_lived_user','short_lived_user','tiktok_business'));