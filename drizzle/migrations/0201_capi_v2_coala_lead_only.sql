-- #322: Coala enfileira só Lead; CompleteRegistration permanece no browser até existir event_id partilhado.
-- Substitui apenas capi_v2_enqueue(integer); não executa a função nem altera dados existentes.
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
    SELECT lc.id, lc.client_event_id, t.pixel_id, t.portal
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
    WHERE e.ev = 'Lead' OR c.portal IS DISTINCT FROM 'coala'
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