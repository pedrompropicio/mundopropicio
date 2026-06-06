-- ============================================================
-- M1 Fundações Marketing/CRM (05/06/26)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.set_published_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.published_at = COALESCE(NEW.published_at, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_at = COALESCE(NEW.published_at, now());
    ELSIF NEW.status = 'draft' THEN
      NEW.published_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1. event_marketing
CREATE TABLE public.event_marketing (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at timestamptz,
  hook_pt text, hook_en text,
  description_long_pt text, description_long_en text,
  meta_description_pt text, meta_description_en text,
  hero_image_url text, og_image_url text, poster_vertical_url text,
  gallery_urls text[],
  press_quote_pt text, press_quote_en text, press_quote_source text,
  cta_primary_label_pt text, cta_primary_label_en text,
  urgency_message_pt text, urgency_message_en text,
  performer_name text, performer_url text,
  offer_price_min numeric(10,2), offer_price_max numeric(10,2),
  offer_currency text DEFAULT 'EUR',
  offer_availability text CHECK (offer_availability IS NULL OR offer_availability IN ('InStock','SoldOut','PreOrder','LimitedAvailability')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_marketing_company_status ON public.event_marketing(company_id, status);
CREATE INDEX idx_event_marketing_published_at ON public.event_marketing(published_at DESC NULLS LAST) WHERE status = 'published';
CREATE TRIGGER trg_event_marketing_updated_at BEFORE UPDATE ON public.event_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_event_marketing_published_at BEFORE INSERT OR UPDATE OF status ON public.event_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_published_at();
ALTER TABLE public.event_marketing ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_marketing_select ON public.event_marketing FOR SELECT TO authenticated USING (true);
CREATE POLICY event_marketing_write ON public.event_marketing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR public.has_role(auth.uid(), 'editor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR public.has_role(auth.uid(), 'editor'::public.app_role));
CREATE POLICY event_marketing_company_isolation ON public.event_marketing AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_marketing TO authenticated;
GRANT ALL ON public.event_marketing TO service_role;

-- 2. static_pages
CREATE TABLE public.static_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  slug text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('pt','en')),
  title text, content_md text,
  meta_title text, meta_description text, og_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug, locale)
);
CREATE INDEX idx_static_pages_status ON public.static_pages(company_id, status);
CREATE TRIGGER trg_static_pages_updated_at BEFORE UPDATE ON public.static_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_static_pages_published_at BEFORE INSERT OR UPDATE OF status ON public.static_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_published_at();
ALTER TABLE public.static_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY static_pages_select ON public.static_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY static_pages_write ON public.static_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR public.has_role(auth.uid(), 'editor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR public.has_role(auth.uid(), 'editor'::public.app_role));
CREATE POLICY static_pages_company_isolation ON public.static_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.static_pages TO authenticated;
GRANT ALL ON public.static_pages TO service_role;

-- 3. audiences
CREATE TABLE public.audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  name text NOT NULL, description text,
  criterion jsonb NOT NULL DEFAULT '{"match":"all","filters":[]}'::jsonb,
  last_preview_count int, last_previewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audiences_company ON public.audiences(company_id);
CREATE TRIGGER trg_audiences_updated_at BEFORE UPDATE ON public.audiences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY audiences_select ON public.audiences FOR SELECT TO authenticated USING (true);
CREATE POLICY audiences_write ON public.audiences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role));
CREATE POLICY audiences_company_isolation ON public.audiences AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiences TO authenticated;
GRANT ALL ON public.audiences TO service_role;

-- 4. audience_snapshots
CREATE TABLE public.audience_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  audience_id uuid NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  member_count int NOT NULL DEFAULT 0,
  notes text,
  exported_at timestamptz,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audience_snapshots_audience ON public.audience_snapshots(audience_id);
CREATE INDEX idx_audience_snapshots_company ON public.audience_snapshots(company_id);
ALTER TABLE public.audience_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY audience_snapshots_select ON public.audience_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY audience_snapshots_write ON public.audience_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role));
CREATE POLICY audience_snapshots_company_isolation ON public.audience_snapshots AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_snapshots TO authenticated;
GRANT ALL ON public.audience_snapshots TO service_role;

-- 5. audience_members
CREATE TABLE public.audience_members (
  snapshot_id uuid NOT NULL REFERENCES public.audience_snapshots(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, contact_id)
);
CREATE INDEX idx_audience_members_contact ON public.audience_members(contact_id);
CREATE INDEX idx_audience_members_company ON public.audience_members(company_id);
ALTER TABLE public.audience_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY audience_members_select ON public.audience_members FOR SELECT TO authenticated USING (true);
CREATE POLICY audience_members_write ON public.audience_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role));
CREATE POLICY audience_members_company_isolation ON public.audience_members AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_members TO authenticated;
GRANT ALL ON public.audience_members TO service_role;

-- 6. email_campaigns
CREATE TABLE public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  name text NOT NULL,
  subject_pt text, subject_en text,
  preheader_pt text, preheader_en text,
  body_md_pt text, body_md_en text,
  audience_id uuid REFERENCES public.audiences(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_campaigns_company_status ON public.email_campaigns(company_id, status);
CREATE TRIGGER trg_email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_campaigns_select ON public.email_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY email_campaigns_write ON public.email_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role));
CREATE POLICY email_campaigns_company_isolation ON public.email_campaigns AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;

-- 7. communication_log (append-only, escrita por service_role)
CREATE TABLE public.communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','push')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  subject text,
  body_preview text,
  status text,
  provider_message_id text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_communication_log_company_occurred ON public.communication_log(company_id, occurred_at DESC);
CREATE INDEX idx_communication_log_contact ON public.communication_log(contact_id);
CREATE INDEX idx_communication_log_campaign ON public.communication_log(campaign_id);
ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY communication_log_select ON public.communication_log FOR SELECT TO authenticated USING (true);
CREATE POLICY communication_log_company_isolation ON public.communication_log AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
GRANT SELECT ON public.communication_log TO authenticated;
GRANT ALL ON public.communication_log TO service_role;