-- Seed Google Ads service-account "connection" row for Mundo Propício.
-- Conditional INSERT so it works in Test (no MP company) without error.
INSERT INTO crm.ad_platform_connections (
  id, company_id, platform, external_business_id, external_business_name,
  access_token_encrypted, token_type, selected_ad_account_id,
  selected_ad_account_name, status
)
SELECT
  'c0000000-0000-4000-a000-000022000431'::uuid,
  '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid,
  'google',
  'service_account:2200043144',
  'Mundo Propício (Google Ads, service account)',
  'service_account',
  'system_user',
  '2200043144',
  'Mundo Propício',
  'active'
WHERE EXISTS (
  SELECT 1 FROM public.companies
  WHERE id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid
)
ON CONFLICT (company_id, platform) DO NOTHING;