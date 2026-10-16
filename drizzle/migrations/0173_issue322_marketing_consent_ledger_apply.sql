-- #322 etapa ERP — prova de consentimento marketing (Meta) por interação. Aditivo; nada retroativo.
-- (0172 ficou vazia por engano operacional; este é o DDL efetivo.)
CREATE TABLE IF NOT EXISTS public.marketing_consent_policies (
  portal text NOT NULL CHECK (portal IN ('mp','coala','newgang')),
  policy_version text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  ttl_days integer NOT NULL CHECK (ttl_days BETWEEN 1 AND 395),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portal, policy_version)
);
CREATE TABLE IF NOT EXISTS public.marketing_consent_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  portal text NOT NULL CHECK (portal IN ('mp','coala','newgang')),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.marketing_consent_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES public.marketing_consent_subjects(id),
  company_id uuid NOT NULL,
  portal text NOT NULL CHECK (portal IN ('mp','coala','newgang')),
  state text NOT NULL CHECK (state IN ('granted','denied','revoked')),
  purpose text NOT NULL CHECK (purpose = 'meta_ads'),
  policy_version text NOT NULL,
  banner_version text NOT NULL,
  client_seq bigint NOT NULL CHECK (client_seq > 0),
  client_decided_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key uuid NOT NULL,
  origin text,
  path text,
  UNIQUE (subject_id, idempotency_key),
  UNIQUE (subject_id, client_seq)
);
CREATE INDEX IF NOT EXISTS marketing_consent_events_subject_seq_idx ON public.marketing_consent_events (subject_id, client_seq DESC, id DESC);

REVOKE ALL ON public.marketing_consent_policies, public.marketing_consent_subjects, public.marketing_consent_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.marketing_consent_policies, public.marketing_consent_subjects, public.marketing_consent_events TO service_role;
ALTER TABLE public.marketing_consent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._marketing_consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'marketing_consent_events é append-only (#322)'; END $$;
DROP TRIGGER IF EXISTS trg_marketing_consent_events_append_only ON public.marketing_consent_events;
CREATE TRIGGER trg_marketing_consent_events_append_only BEFORE UPDATE OR DELETE ON public.marketing_consent_events
  FOR EACH ROW EXECUTE FUNCTION public._marketing_consent_append_only();

ALTER TABLE public.lead_capture ADD COLUMN IF NOT EXISTS consent_subject_id uuid, ADD COLUMN IF NOT EXISTS consent_event_id bigint, ADD COLUMN IF NOT EXISTS consent_portal text;
ALTER TABLE public.redirect_log ADD COLUMN IF NOT EXISTS consent_subject_id uuid, ADD COLUMN IF NOT EXISTS consent_event_id bigint, ADD COLUMN IF NOT EXISTS consent_portal text, ADD COLUMN IF NOT EXISTS consent_company_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_subject_id uuid, ADD COLUMN IF NOT EXISTS consent_event_id bigint, ADD COLUMN IF NOT EXISTS consent_portal text;

CREATE OR REPLACE FUNCTION public.marketing_consent_scope_ok(p_company uuid, p_portal text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce((p_portal IN ('mp','newgang') AND p_company = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid)
      OR (p_portal = 'coala' AND p_company = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid), false);
$$;

CREATE OR REPLACE FUNCTION public.marketing_strip_meta_params(p_url text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_url IS NULL THEN NULL ELSE
    regexp_replace(regexp_replace(p_url, '([?&])(fbclid|_fbc|_fbp|fbc|fbp)=[^&#]*&?', '\1', 'gi'), '[?&]+(#|$)', '\1') END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_consent_effective(p_subject uuid, p_at timestamptz)
RETURNS TABLE (event_id bigint, state text, client_seq bigint, valid_grant boolean, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.state, e.client_seq,
    (e.state = 'granted' AND p.portal IS NOT NULL
      AND e.server_received_at >= p.valid_from AND (p.valid_to IS NULL OR e.server_received_at < p.valid_to)
      AND e.server_received_at + make_interval(days => p.ttl_days) > p_at) AS valid_grant,
    CASE WHEN p.portal IS NOT NULL THEN e.server_received_at + make_interval(days => p.ttl_days) END
  FROM public.marketing_consent_events e
  LEFT JOIN public.marketing_consent_policies p ON p.portal = e.portal AND p.policy_version = e.policy_version
  WHERE e.subject_id = p_subject AND e.server_received_at <= p_at
  ORDER BY e.client_seq DESC, e.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.marketing_consent_record(
  p_company uuid, p_portal text, p_token text, p_state text, p_purpose text,
  p_policy text, p_banner text, p_seq bigint, p_client_at timestamptz, p_idem uuid, p_origin text, p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.marketing_consent_subjects%ROWTYPE; v_new_token text; v_ev public.marketing_consent_events%ROWTYPE;
        v_eff record; v_replay boolean := false;
BEGIN
  IF NOT public.marketing_consent_scope_ok(p_company, p_portal) THEN RETURN jsonb_build_object('ok', false, 'error', 'scope_invalid'); END IF;
  IF p_state IS NULL OR p_state NOT IN ('granted','denied','revoked') THEN RETURN jsonb_build_object('ok', false, 'error', 'state_invalid'); END IF;
  IF p_purpose IS DISTINCT FROM 'meta_ads' THEN RETURN jsonb_build_object('ok', false, 'error', 'purpose_invalid'); END IF;
  IF p_idem IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required'); END IF;
  IF p_seq IS NULL OR p_seq <= 0 OR p_seq > (extract(epoch from now()) * 1000)::bigint + 300000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seq_invalid'); END IF;
  IF coalesce(length(p_policy),0) NOT BETWEEN 1 AND 64 OR coalesce(length(p_banner),0) NOT BETWEEN 1 AND 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_invalid'); END IF;
  IF p_state = 'granted' AND NOT EXISTS (SELECT 1 FROM public.marketing_consent_policies
       WHERE portal = p_portal AND policy_version = p_policy AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'policy_invalid'); END IF;

  IF p_token IS NULL OR p_token = '' THEN
    v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.marketing_consent_subjects (company_id, portal, token_hash)
    VALUES (p_company, p_portal, encode(extensions.digest(v_new_token, 'sha256'), 'hex')) RETURNING * INTO v_sub;
  ELSE
    IF p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'subject_invalid'); END IF;
    SELECT * INTO v_sub FROM public.marketing_consent_subjects WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
    IF v_sub.id IS NULL OR v_sub.company_id <> p_company OR v_sub.portal <> p_portal THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subject_invalid'); END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mcs:' || v_sub.id::text, 0));
  SELECT * INTO v_ev FROM public.marketing_consent_events WHERE subject_id = v_sub.id AND idempotency_key = p_idem;
  IF v_ev.id IS NOT NULL THEN
    IF v_ev.state <> p_state OR v_ev.client_seq <> p_seq THEN RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict'); END IF;
    v_replay := true;
  ELSE
    IF EXISTS (SELECT 1 FROM public.marketing_consent_events WHERE subject_id = v_sub.id AND client_seq = p_seq) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'seq_conflict'); END IF;
    INSERT INTO public.marketing_consent_events (subject_id, company_id, portal, state, purpose, policy_version, banner_version,
      client_seq, client_decided_at, idempotency_key, origin, path)
    VALUES (v_sub.id, p_company, p_portal, p_state, 'meta_ads', p_policy, p_banner, p_seq, p_client_at, p_idem,
      left(p_origin, 200), left(p_path, 300)) RETURNING * INTO v_ev;
  END IF;
  SELECT * INTO v_eff FROM public.marketing_consent_effective(v_sub.id, clock_timestamp());
  RETURN jsonb_build_object('ok', true, 'replay', v_replay, 'decision_id', v_ev.id, 'recorded_state', v_ev.state,
    'server_received_at', v_ev.server_received_at, 'subject_token', v_new_token,
    'effective_state', v_eff.state, 'effective_decision_id', v_eff.event_id,
    'marketing_allowed', coalesce(v_eff.valid_grant, false),
    'expires_at', CASE WHEN v_eff.valid_grant THEN v_eff.expires_at END);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_consent_bind(p_company uuid, p_portal text, p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.marketing_consent_subjects%ROWTYPE; v_eff record;
BEGIN
  IF NOT public.marketing_consent_scope_ok(p_company, p_portal) THEN RETURN jsonb_build_object('proof', false, 'reason', 'scope_invalid'); END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('proof', false, 'reason', 'no_token'); END IF;
  SELECT * INTO v_sub FROM public.marketing_consent_subjects WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  IF v_sub.id IS NULL OR v_sub.company_id <> p_company OR v_sub.portal <> p_portal THEN
    RETURN jsonb_build_object('proof', false, 'reason', 'subject_invalid'); END IF;
  SELECT * INTO v_eff FROM public.marketing_consent_effective(v_sub.id, clock_timestamp());
  IF NOT coalesce(v_eff.valid_grant, false) THEN
    RETURN jsonb_build_object('proof', false, 'reason', coalesce('state_' || v_eff.state, 'no_decision')); END IF;
  RETURN jsonb_build_object('proof', true, 'subject_id', v_sub.id, 'event_id', v_eff.event_id);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_consent_binding_valid(
  p_subject uuid, p_event bigint, p_company uuid, p_portal text, p_captured_at timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.marketing_consent_events%ROWTYPE; cap record; cur record;
BEGIN
  IF p_subject IS NULL OR p_event IS NULL OR p_company IS NULL OR p_portal IS NULL OR p_captured_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO e FROM public.marketing_consent_events WHERE id = p_event;
  IF e.id IS NULL OR e.subject_id <> p_subject OR e.state <> 'granted' OR e.purpose <> 'meta_ads'
     OR e.company_id <> p_company OR e.portal <> p_portal THEN RETURN false; END IF;
  SELECT * INTO cap FROM public.marketing_consent_effective(p_subject, p_captured_at);
  IF cap.event_id IS DISTINCT FROM e.id OR NOT coalesce(cap.valid_grant, false) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_consent_events x WHERE x.subject_id = p_subject
             AND x.state IN ('denied','revoked') AND (x.client_seq > e.client_seq OR x.id > e.id)) THEN RETURN false; END IF;
  SELECT * INTO cur FROM public.marketing_consent_effective(p_subject, clock_timestamp());
  RETURN coalesce(cur.valid_grant, false);
END $$;

CREATE OR REPLACE FUNCTION public.capi_consent_proof(p_lead_id uuid, p_event_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  IF p_event_name IS NULL OR p_event_name NOT IN ('ViewContent','Lead','InitiateCheckout') THEN RETURN false; END IF;
  SELECT id, company_id, created_at, consent_subject_id, consent_event_id, consent_portal INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL THEN RETURN false; END IF;
  RETURN coalesce(public.marketing_consent_binding_valid(l.consent_subject_id, l.consent_event_id, l.company_id, l.consent_portal, l.created_at), false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public._marketing_consent_capture_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_company uuid; v_ok boolean := false; k text;
BEGIN
  BEGIN v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  EXCEPTION WHEN OTHERS THEN v_role := ''; END;
  IF TG_TABLE_NAME = 'redirect_log' THEN v_company := NEW.consent_company_id; ELSE v_company := NEW.company_id; END IF;
  IF NEW.consent_subject_id IS NOT NULL OR NEW.consent_event_id IS NOT NULL OR NEW.consent_portal IS NOT NULL THEN
    v_ok := v_role = 'service_role'
      AND coalesce(public.marketing_consent_binding_valid(NEW.consent_subject_id, NEW.consent_event_id, v_company, NEW.consent_portal, clock_timestamp()), false);
  END IF;
  IF NOT v_ok THEN
    NEW.consent_subject_id := NULL; NEW.consent_event_id := NULL; NEW.consent_portal := NULL;
    NEW.fbc := NULL; NEW.fbp := NULL;
    IF TG_TABLE_NAME = 'redirect_log' THEN
      NEW.consent_company_id := NULL;
      NEW.referrer := public.marketing_strip_meta_params(NEW.referrer);
      NEW.destination_url := public.marketing_strip_meta_params(NEW.destination_url);
    ELSE
      IF NEW.raw IS NOT NULL AND jsonb_typeof(NEW.raw) = 'object' THEN
        FOREACH k IN ARRAY ARRAY['fbc','fbp','_fbc','_fbp','fbclid'] LOOP NEW.raw := NEW.raw - k; END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_capture_consent_guard ON public.lead_capture;
CREATE TRIGGER trg_lead_capture_consent_guard BEFORE INSERT ON public.lead_capture FOR EACH ROW EXECUTE FUNCTION public._marketing_consent_capture_guard();
DROP TRIGGER IF EXISTS trg_redirect_log_consent_guard ON public.redirect_log;
CREATE TRIGGER trg_redirect_log_consent_guard BEFORE INSERT ON public.redirect_log FOR EACH ROW EXECUTE FUNCTION public._marketing_consent_capture_guard();

CREATE OR REPLACE FUNCTION public._leads_copy_consent_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lc record;
BEGIN
  NEW.consent_subject_id := NULL; NEW.consent_event_id := NULL; NEW.consent_portal := NULL;
  IF NEW.meta ? 'lead_capture_id' THEN
    SELECT consent_subject_id, consent_event_id, consent_portal, company_id INTO lc
      FROM public.lead_capture WHERE id = (NEW.meta ->> 'lead_capture_id')::uuid;
    IF lc.consent_event_id IS NOT NULL AND lc.company_id = NEW.company_id THEN
      NEW.consent_subject_id := lc.consent_subject_id; NEW.consent_event_id := lc.consent_event_id; NEW.consent_portal := lc.consent_portal;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.consent_subject_id := NULL; NEW.consent_event_id := NULL; NEW.consent_portal := NULL; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_leads_copy_consent_binding ON public.leads;
CREATE TRIGGER trg_leads_copy_consent_binding BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public._leads_copy_consent_binding();

REVOKE ALL ON FUNCTION public.marketing_consent_scope_ok(uuid,text), public.marketing_consent_effective(uuid,timestamptz),
  public.marketing_consent_record(uuid,text,text,text,text,text,text,bigint,timestamptz,uuid,text,text),
  public.marketing_consent_bind(uuid,text,text), public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz),
  public.capi_consent_proof(uuid,text), public._marketing_consent_capture_guard(), public._leads_copy_consent_binding(),
  public._marketing_consent_append_only(), public.marketing_strip_meta_params(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_consent_scope_ok(uuid,text), public.marketing_consent_effective(uuid,timestamptz),
  public.marketing_consent_record(uuid,text,text,text,text,text,text,bigint,timestamptz,uuid,text,text),
  public.marketing_consent_bind(uuid,text,text), public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz),
  public.capi_consent_proof(uuid,text), public.marketing_strip_meta_params(text) TO service_role;