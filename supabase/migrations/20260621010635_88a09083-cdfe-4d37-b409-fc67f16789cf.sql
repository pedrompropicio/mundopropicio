ALTER TABLE crm.ad_platform_connections ADD COLUMN IF NOT EXISTS login_customer_id text;

COMMENT ON COLUMN crm.ad_platform_connections.login_customer_id IS 'Google Ads login-customer-id (MCC) por conexão. Permite suporte multi-MCC futuro. Para Meta fica NULL.';

UPDATE crm.ad_platform_connections
SET login_customer_id = '9743221780'
WHERE platform = 'google'
  AND company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
  AND login_customer_id IS NULL;