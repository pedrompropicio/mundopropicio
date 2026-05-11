
-- Ensure crm schema exists
CREATE SCHEMA IF NOT EXISTS crm;

-- Table mirroring Live
CREATE TABLE IF NOT EXISTS crm.meta_creatives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'crm-meta-creatives',
  storage_path text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  file_mime_type text,
  width integer,
  height integer,
  duration_seconds numeric,
  headline text,
  body text,
  cta_type text,
  link_url text,
  display_link text,
  tags text[] DEFAULT ARRAY[]::text[],
  analysis_jsonb jsonb,
  analyzed_at timestamptz,
  analysis_model text,
  meta_image_hash text,
  meta_creative_id text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_creatives_company ON crm.meta_creatives(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_creatives_tags ON crm.meta_creatives USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_meta_creatives_created_by ON crm.meta_creatives(created_by);

-- updated_at trigger (uses public.update_updated_at_column if exists, else inline)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_meta_creatives_updated_at ON crm.meta_creatives;
CREATE TRIGGER trg_meta_creatives_updated_at
  BEFORE UPDATE ON crm.meta_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE crm.meta_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_creatives;
CREATE POLICY service_role_bypass ON crm.meta_creatives
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_creatives;
CREATE POLICY tenant_isolation_select ON crm.meta_creatives
  FOR SELECT TO authenticated USING (company_id = current_company_id());

DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_creatives;
CREATE POLICY tenant_isolation_insert ON crm.meta_creatives
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS tenant_isolation_update ON crm.meta_creatives;
CREATE POLICY tenant_isolation_update ON crm.meta_creatives
  FOR UPDATE TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS tenant_isolation_delete ON crm.meta_creatives;
CREATE POLICY tenant_isolation_delete ON crm.meta_creatives
  FOR DELETE TO authenticated USING (company_id = current_company_id());

-- Expose crm schema to PostgREST clients (matches Live)
GRANT USAGE ON SCHEMA crm TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.meta_creatives TO authenticated;
GRANT ALL ON crm.meta_creatives TO service_role;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-meta-creatives',
  'crm-meta-creatives',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
DROP POLICY IF EXISTS authenticated_upload_creatives ON storage.objects;
CREATE POLICY authenticated_upload_creatives ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-meta-creatives');

DROP POLICY IF EXISTS authenticated_select_creatives ON storage.objects;
CREATE POLICY authenticated_select_creatives ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'crm-meta-creatives');

DROP POLICY IF EXISTS authenticated_update_creatives ON storage.objects;
CREATE POLICY authenticated_update_creatives ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'crm-meta-creatives');

DROP POLICY IF EXISTS authenticated_delete_creatives ON storage.objects;
CREATE POLICY authenticated_delete_creatives ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'crm-meta-creatives');

DROP POLICY IF EXISTS public_select_creatives ON storage.objects;
CREATE POLICY public_select_creatives ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'crm-meta-creatives');
