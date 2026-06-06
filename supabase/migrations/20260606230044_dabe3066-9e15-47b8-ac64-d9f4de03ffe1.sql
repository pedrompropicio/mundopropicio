-- Caso A: events.company_id = MP, sócio externo gere
ALTER TABLE public.events
  ADD COLUMN management_type TEXT NOT NULL DEFAULT 'own'
    CHECK (management_type IN ('own','partner_managed')),
  ADD COLUMN partner_name TEXT NULL;

COMMENT ON COLUMN public.events.management_type IS
  'own = MP gere tudo (default). partner_managed = sócio externo gere financeiro/tráfego, evento aparece no portal.';

COMMENT ON COLUMN public.events.partner_name IS
  'Nome do sócio/parceiro quando management_type=partner_managed (ex.: "Pulsetto Productions").';

CREATE INDEX idx_events_company_management
  ON public.events (company_id, management_type);

-- Caso B: tabela de endorsement cross-company
CREATE TABLE public.event_portal_endorsements (
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  portal_company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  partner_label       TEXT,
  display_order       INT NOT NULL DEFAULT 0,
  featured            BOOLEAN NOT NULL DEFAULT false,
  override_hero_image_url TEXT,
  added_by            UUID REFERENCES auth.users(id),
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, portal_company_id)
);

COMMENT ON TABLE public.event_portal_endorsements IS
  'Marca eventos de outras companies como visíveis no portal de uma company (ex.: Coala da Cloudscape endossado pela MP).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_portal_endorsements TO authenticated;
GRANT ALL ON public.event_portal_endorsements TO service_role;

CREATE INDEX idx_event_portal_endorsements_portal_company
  ON public.event_portal_endorsements (portal_company_id, featured DESC, display_order);

CREATE TRIGGER set_event_portal_endorsements_updated_at
  BEFORE UPDATE ON public.event_portal_endorsements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_portal_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_portal_endorsements_select ON public.event_portal_endorsements
  FOR SELECT TO authenticated
  USING (
    portal_company_id = public.current_company_id()
    OR event_id IN (SELECT id FROM public.events WHERE company_id = public.current_company_id())
  );

CREATE POLICY event_portal_endorsements_modify ON public.event_portal_endorsements
  FOR ALL TO authenticated
  USING (
    portal_company_id = public.current_company_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','platform_admin','marketing_manager')
    )
  )
  WITH CHECK (
    portal_company_id = public.current_company_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','platform_admin','marketing_manager')
    )
  );