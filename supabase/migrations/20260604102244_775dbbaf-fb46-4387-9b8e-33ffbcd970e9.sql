-- Portal Sprint 1 recovery migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hero_image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS poster_image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_map_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_directions_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_pixel_id text;

CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique_idx
  ON public.events(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  artist_image_url text,
  artist_bio_pt text,
  artist_bio_en text,
  stage text,
  performance_date timestamptz,
  performance_time time,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_lineups_event_order_idx ON public.event_lineups(event_id, display_order);
CREATE INDEX IF NOT EXISTS event_lineups_company_idx ON public.event_lineups(company_id);
ALTER TABLE public.event_lineups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  question_pt text NOT NULL,
  question_en text,
  answer_pt text NOT NULL,
  answer_en text,
  category text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_faqs_event_order_idx ON public.event_faqs(event_id, display_order);
ALTER TABLE public.event_faqs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  email text,
  phone_e164 text,
  name text,
  email_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN email IS NOT NULL
      THEN encode(digest(lower(trim(email)), 'sha256'), 'hex')
      ELSE NULL END
  ) STORED,
  phone_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN phone_e164 IS NOT NULL
      THEN encode(digest(phone_e164, 'sha256'), 'hex')
      ELSE NULL END
  ) STORED,
  consent_email boolean NOT NULL DEFAULT false,
  consent_whatsapp boolean NOT NULL DEFAULT false,
  consent_email_at timestamptz,
  consent_whatsapp_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  source text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique_idx
  ON public.contacts(company_id, lower(trim(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_unique_idx
  ON public.contacts(company_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_email_hash_idx ON public.contacts(email_hash_sha256);
CREATE INDEX IF NOT EXISTS contacts_phone_hash_idx ON public.contacts(phone_hash_sha256);
CREATE INDEX IF NOT EXISTS contacts_source_idx ON public.contacts(source);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts(company_id);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  kind text NOT NULL,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  mp_click_id text,
  ip_inet inet,
  user_agent text,
  fbc text,
  fbp text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_contact_idx ON public.leads(contact_id);
CREATE INDEX IF NOT EXISTS leads_event_idx ON public.leads(event_id);
CREATE INDEX IF NOT EXISTS leads_kind_created_idx ON public.leads(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_mp_click_idx ON public.leads(mp_click_id) WHERE mp_click_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_company_idx ON public.leads(company_id);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lead_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  name text,
  consent_email boolean NOT NULL DEFAULT false,
  consent_whatsapp boolean NOT NULL DEFAULT false,
  event_slug text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbc text,
  fbp text,
  ip_inet inet,
  user_agent text,
  raw jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_capture ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.redirect_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  mp_click_id text,
  ip_inet inet,
  user_agent text,
  referrer text,
  fbc text,
  fbp text,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.redirect_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_lineups_authenticated_all" ON public.event_lineups;
CREATE POLICY "event_lineups_authenticated_all" ON public.event_lineups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company_isolation_event_lineups" ON public.event_lineups;
CREATE POLICY "company_isolation_event_lineups" ON public.event_lineups
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "event_faqs_authenticated_all" ON public.event_faqs;
CREATE POLICY "event_faqs_authenticated_all" ON public.event_faqs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company_isolation_event_faqs" ON public.event_faqs;
CREATE POLICY "company_isolation_event_faqs" ON public.event_faqs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "contacts_admin_editor_select" ON public.contacts;
CREATE POLICY "contacts_admin_editor_select" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  );
DROP POLICY IF EXISTS "company_isolation_contacts" ON public.contacts;
CREATE POLICY "company_isolation_contacts" ON public.contacts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "leads_admin_editor_select" ON public.leads;
CREATE POLICY "leads_admin_editor_select" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  );
DROP POLICY IF EXISTS "company_isolation_leads" ON public.leads;
CREATE POLICY "company_isolation_leads" ON public.leads
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "lead_capture_anon_insert" ON public.lead_capture;
CREATE POLICY "lead_capture_anon_insert" ON public.lead_capture
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "redirect_log_anon_insert" ON public.redirect_log;
CREATE POLICY "redirect_log_anon_insert" ON public.redirect_log
  FOR INSERT TO anon WITH CHECK (true);

CREATE OR REPLACE VIEW public.events_public
WITH (security_invoker = false) AS
SELECT
  e.id,
  e.slug,
  COALESCE(e.title_pt, e.name) AS title_pt,
  COALESCE(e.title_en, e.name) AS title_en,
  e.description_pt,
  e.description_en,
  COALESCE(e.location_pt, e.location) AS location_pt,
  COALESCE(e.location_en, e.location) AS location_en,
  e.date,
  e.hero_image_url,
  e.poster_image_url,
  e.venue_map_url,
  e.venue_directions_url,
  e.ticketing_url,
  e.meta_pixel_id,
  e.portal_featured AS featured,
  (e.date < current_date) AS is_past
FROM public.events e
WHERE e.portal_visible = true
  AND e.slug IS NOT NULL;

CREATE OR REPLACE VIEW public.event_lineups_public
WITH (security_invoker = false) AS
SELECT
  l.id,
  l.event_id,
  e.slug AS event_slug,
  l.artist_name,
  l.artist_image_url,
  l.artist_bio_pt,
  l.artist_bio_en,
  l.stage,
  l.performance_date,
  l.performance_time,
  l.display_order
FROM public.event_lineups l
JOIN public.events e ON e.id = l.event_id
WHERE e.portal_visible = true AND e.slug IS NOT NULL;

CREATE OR REPLACE VIEW public.event_faqs_public
WITH (security_invoker = false) AS
SELECT
  f.id,
  f.event_id,
  e.slug AS event_slug,
  f.question_pt,
  f.question_en,
  f.answer_pt,
  f.answer_en,
  f.category,
  f.display_order
FROM public.event_faqs f
JOIN public.events e ON e.id = f.event_id
WHERE e.portal_visible = true AND e.slug IS NOT NULL;

GRANT SELECT ON public.events_public TO anon, authenticated;
GRANT SELECT ON public.event_lineups_public TO anon, authenticated;
GRANT SELECT ON public.event_faqs_public TO anon, authenticated;

GRANT INSERT ON public.lead_capture TO anon, authenticated;
GRANT INSERT ON public.redirect_log TO anon, authenticated;

UPDATE public.events
SET
  portal_visible = true,
  portal_featured = true,
  slug = COALESCE(slug, 'ivete-clareou-2026'),
  meta_pixel_id = COALESCE(meta_pixel_id, '1647180363218298'),
  ticketing_url = COALESCE(ticketing_url, 'https://www.ticketline.pt/evento/ivete-clareou-portugal-103211/sessao/124835_1409_1788627600')
WHERE id = '4fca2381-1db9-4ff5-9dc0-91068de88a02';

UPDATE public.events
SET
  portal_visible = true,
  portal_featured = true,
  slug = COALESCE(slug, 'anitta-eda-2026'),
  meta_pixel_id = COALESCE(meta_pixel_id, '1485199726043897'),
  ticketing_url = COALESCE(ticketing_url, 'https://www.ticketline.pt/evento/ensaios-da-anitta-lisboa-101770/sessao/123468_234_1784394000')
WHERE id = 'fdfb39fe-45f2-43f5-9ec9-7cb536360ae1';

COMMIT;