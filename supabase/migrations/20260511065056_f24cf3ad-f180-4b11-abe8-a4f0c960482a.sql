
CREATE TABLE IF NOT EXISTS crm.ad_platform_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  ad_account_name text,
  ad_account_currency text,
  display_label text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (connection_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS ad_platform_account_links_company_idx
  ON crm.ad_platform_account_links (company_id);
CREATE INDEX IF NOT EXISTS ad_platform_account_links_connection_idx
  ON crm.ad_platform_account_links (connection_id);

ALTER TABLE crm.ad_platform_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their company ad account links" ON crm.ad_platform_account_links;
CREATE POLICY "users see their company ad account links"
  ON crm.ad_platform_account_links
  FOR SELECT
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "users manage their company ad account links" ON crm.ad_platform_account_links;
CREATE POLICY "users manage their company ad account links"
  ON crm.ad_platform_account_links
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- Backfill a partir das conexões Meta existentes
INSERT INTO crm.ad_platform_account_links
  (connection_id, company_id, ad_account_id, ad_account_name, ad_account_currency,
   display_label, is_primary, enabled)
SELECT
  c.id,
  c.company_id,
  COALESCE(acc->>'id', 'act_' || (acc->>'account_id')),
  acc->>'name',
  acc->>'currency',
  COALESCE(acc->>'name', acc->>'id'),
  COALESCE(acc->>'id', 'act_' || (acc->>'account_id')) = c.selected_ad_account_id,
  true
FROM crm.ad_platform_connections c
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.available_ad_accounts, '[]'::jsonb)) AS acc
WHERE c.status = 'active'
ON CONFLICT (connection_id, ad_account_id) DO NOTHING;
