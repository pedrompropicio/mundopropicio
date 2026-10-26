-- #359 P3: vista de leitura; preserva a RLS de lead_capture e não modifica cadastros.
CREATE VIEW public.lead_capture_consent_resumo
WITH (security_invoker = true)
AS
SELECT id, company_id, source, created_at, email, name,
  consent_email, consent_email_text_version,
  consent_whatsapp, consent_whatsapp_text_version, consent_decided_at,
  CASE WHEN consent_event_id IS NOT NULL THEN 'aceite_com_prova'
       WHEN fbp IS NOT NULL OR fbc IS NOT NULL THEN 'aceite_inferido_pixel'
       ELSE 'sem_registo' END AS cookies_marketing,
  CASE WHEN raw->>'consent_proof_origin' = 'historico_site' THEN 'historico_site'
       ELSE 'registada_na_hora' END AS origem_prova
FROM public.lead_capture;
REVOKE ALL ON public.lead_capture_consent_resumo FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.lead_capture_consent_resumo TO authenticated, service_role;