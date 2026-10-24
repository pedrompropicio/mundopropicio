-- Revisão: https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6387254548
-- Original SHA256: d6b2596236d762f8402799d7f4efd08da19a8ad40d85e06acb834fa50b35ab94
-- retirar apenas INSERT operacional capi_v2_targets; preservar DDL, templates e controlos de segurança
-- CAPI v2 (#322 opção A): fila de envio por prova de consentimento. INERTE: targets nascem enabled=false, start_at=NULL (nada elegível).
CREATE TABLE public.capi_v2_targets (
  event_slug text PRIMARY KEY,
  portal text NOT NULL,
  pixel_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.capi_v2_targets TO service_role;
ALTER TABLE public.capi_v2_targets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.capi_v2_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id text NOT NULL,
  pixel_id text NOT NULL,
  event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','retry','failed_terminal','expired','skipped_no_consent')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  fbtrace_id text,
  http_status integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pixel_id, event_name, event_id)
);
GRANT ALL ON public.capi_v2_events TO service_role;
ALTER TABLE public.capi_v2_events ENABLE ROW LEVEL SECURITY;

-- Enfileira Lead + CompleteRegistration (lead_capture com prova) e ClubeConfirmado (Newgang).
-- Só linhas criadas DEPOIS de start_at; prova revalidada no envio pela edge function.
CREATE OR REPLACE FUNCTION public.capi_v2_enqueue(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_n integer := 0;
BEGIN
  WITH cand AS (
    SELECT lc.id, lc.client_event_id, t.pixel_id
    FROM public.lead_capture lc
    JOIN public.capi_v2_targets t ON t.event_slug = lc.event_slug
    WHERE lc.consent_event_id IS NOT NULL
      AND lc.client_event_id IS NOT NULL
      AND t.enabled AND t.start_at IS NOT NULL
      AND lc.created_at >= t.start_at
      AND lc.created_at > now() - interval '6 days'
    ORDER BY lc.created_at DESC
    LIMIT p_limit
  ), ins AS (
    INSERT INTO public.capi_v2_events (source_table, source_id, pixel_id, event_name, event_id)
    SELECT 'lead_capture', c.id::text, c.pixel_id, e.ev, c.client_event_id::text
    FROM cand c CROSS JOIN (VALUES ('Lead'), ('CompleteRegistration')) AS e(ev)
    ON CONFLICT (pixel_id, event_name, event_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins;

  WITH cand AS (
    SELECT m.id, m.member_no, t.pixel_id
    FROM public.club_members m
    JOIN public.lead_capture lc ON lower(trim(lc.email)) = lower(trim(m.email)) AND lc.consent_event_id IS NOT NULL
    JOIN public.capi_v2_targets t ON t.portal = 'newgang'
    WHERE m.confirmed_at IS NOT NULL
      AND t.enabled AND t.start_at IS NOT NULL
      AND m.confirmed_at >= t.start_at
      AND m.confirmed_at > now() - interval '6 days'
    ORDER BY m.confirmed_at DESC
    LIMIT p_limit
  ), ins AS (
    INSERT INTO public.capi_v2_events (source_table, source_id, pixel_id, event_name, event_id)
    SELECT 'club_members', c.id::text, c.pixel_id, 'ClubeConfirmado', 'clube_confirmado_' || c.member_no
    FROM cand c
    ON CONFLICT (pixel_id, event_name, event_id) DO NOTHING
    RETURNING 1
  )
  SELECT v_n + count(*) INTO v_n FROM ins;

  RETURN v_n;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.capi_v2_enqueue(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capi_v2_enqueue(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_v2_enqueue(integer) TO service_role;

-- Newgang: email/telefone só entram no user_data se a pessoa tiver anúncios meta_ads concedido e em vigor (#332).
CREATE OR REPLACE FUNCTION public.capi_v2_newgang_ads_ok(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members m
    JOIN public.club_member_marketing_consents c ON c.member_id = m.id AND c.purpose = 'meta_ads'
    CROSS JOIN LATERAL public.marketing_consent_effective(c.subject_id, now()) e
    WHERE lower(trim(m.email)) = lower(trim(p_email))
      AND e.valid_grant
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.capi_v2_newgang_ads_ok(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capi_v2_newgang_ads_ok(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_v2_newgang_ads_ok(text) TO service_role;
