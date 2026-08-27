CREATE OR REPLACE VIEW public.crm_contactos
WITH (security_invoker = true) AS
SELECT
  c.id AS contact_id,
  c.company_id,
  c.name,
  c.email,
  c.phone_e164,
  c.consent_email,
  c.consent_email_at,
  c.consent_whatsapp,
  c.consent_whatsapp_at,
  c.is_active,
  c.source,
  COALESCE(l.first_at, c.first_seen_at) AS first_contact_at,
  COALESCE(l.last_at, c.last_activity_at) AS last_contact_at,
  COALESCE(l.interactions, 0) AS interactions,
  l.last_event_id,
  l.last_kind,
  c.created_at,
  c.updated_at
FROM public.contacts c
LEFT JOIN (
  SELECT
    x.contact_id,
    min(x.created_at) AS first_at,
    max(x.created_at) AS last_at,
    count(*) AS interactions,
    (array_agg(x.event_id ORDER BY x.created_at DESC))[1] AS last_event_id,
    (array_agg(x.kind ORDER BY x.created_at DESC))[1] AS last_kind
  FROM public.leads x
  WHERE x.kind IN ('event_interest', 'newsletter_signup')
    AND x.contact_id IS NOT NULL
  GROUP BY x.contact_id
) l ON l.contact_id = c.id
WHERE c.email IS NOT NULL OR c.phone_e164 IS NOT NULL;

CREATE OR REPLACE VIEW public.crm_eventos_trafego
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.company_id,
  l.created_at,
  l.event_id,
  l.source,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  l.utm_content,
  l.geo_country,
  l.geo_region,
  l.geo_city,
  l.capi_status,
  l.capi_sent_at,
  l.mp_click_id
FROM public.leads l
WHERE l.kind = 'redirect_click';

GRANT SELECT ON public.crm_contactos TO authenticated;
GRANT SELECT ON public.crm_eventos_trafego TO authenticated;

COMMENT ON VIEW public.crm_contactos IS 'Pessoas identificaveis do CRM (contacts com email/telefone) + agregados dos seus leads event_interest/newsletter_signup. Base real de contactos.';
COMMENT ON VIEW public.crm_eventos_trafego IS 'Cliques anonimos de encaminhamento portal -> bilheteira (leads.kind=redirect_click). Nao sao pessoas contactaveis; servem para medicao e conversoes offline.';