-- #322 correção ERP após verificação independente (DDL efetivo; 0174 ficou só com comentário por engano operacional). Incremental; 0172/0173 não são editadas. Nada retroativo.
CREATE OR REPLACE FUNCTION public.marketing_pct_decode_key(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE r text := p; i int;
BEGIN
  IF r IS NULL THEN RETURN NULL; END IF;
  r := replace(r, '+', ' ');
  FOR i IN 1..3 LOOP
    EXIT WHEN r !~ '%[0-9A-Fa-f]{2}';
    SELECT string_agg(CASE WHEN x.tok ~ '^%[0-9A-Fa-f]{2}$' AND ('x' || substr(x.tok, 2))::bit(8)::int > 0
                           THEN chr(('x' || substr(x.tok, 2))::bit(8)::int) ELSE x.tok END, '' ORDER BY x.ord)
      INTO r
      FROM (SELECT m[1] AS tok, ord FROM regexp_matches(r, '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') WITH ORDINALITY AS t(m, ord)) x;
  END LOOP;
  RETURN lower(btrim(coalesce(r, '')));
END $$;

CREATE OR REPLACE FUNCTION public.marketing_is_meta_key(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(public.marketing_pct_decode_key(p) IN ('fbclid','_fbc','_fbp','fbc','fbp'), false);
$$;

CREATE OR REPLACE FUNCTION public.marketing_filter_qs(p_qs text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE kept text; removed int;
BEGIN
  IF p_qs IS NULL OR p_qs = '' THEN RETURN p_qs; END IF;
  SELECT count(*) FILTER (WHERE public.marketing_is_meta_key(split_part(part, '=', 1))),
         string_agg(part, '&' ORDER BY ord) FILTER (WHERE NOT public.marketing_is_meta_key(split_part(part, '=', 1)))
    INTO removed, kept
    FROM unnest(string_to_array(p_qs, '&')) WITH ORDINALITY u(part, ord);
  IF removed = 0 THEN RETURN p_qs; END IF;
  RETURN coalesce(kept, '');
END $$;

CREATE OR REPLACE FUNCTION public.marketing_strip_meta_params(p_url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE base text; frag text := NULL; q text := NULL; pos int; nq text; nf text;
BEGIN
  IF p_url IS NULL THEN RETURN NULL; END IF;
  pos := strpos(p_url, '#');
  IF pos > 0 THEN frag := substr(p_url, pos + 1); base := left(p_url, pos - 1); ELSE base := p_url; END IF;
  pos := strpos(base, '?');
  IF pos > 0 THEN q := substr(base, pos + 1); base := left(base, pos - 1); END IF;
  nq := public.marketing_filter_qs(q);
  nf := CASE WHEN frag IS NOT NULL AND strpos(frag, '=') > 0 THEN public.marketing_filter_qs(frag) ELSE frag END;
  IF nq IS NOT DISTINCT FROM q AND nf IS NOT DISTINCT FROM frag THEN RETURN p_url; END IF;
  RETURN base || CASE WHEN q IS NULL OR nq = '' THEN '' ELSE '?' || nq END
              || CASE WHEN frag IS NULL OR nf = '' THEN '' ELSE '#' || nf END;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_strip_meta_json(j jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF j IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(j)
    WHEN 'object' THEN
      RETURN coalesce((SELECT jsonb_object_agg(key, public.marketing_strip_meta_json(value))
                         FROM jsonb_each(j) WHERE NOT public.marketing_is_meta_key(key)), '{}'::jsonb);
    WHEN 'array' THEN
      RETURN coalesce((SELECT jsonb_agg(public.marketing_strip_meta_json(value) ORDER BY ord)
                         FROM jsonb_array_elements(j) WITH ORDINALITY a(value, ord)), '[]'::jsonb);
    WHEN 'string' THEN RETURN to_jsonb(public.marketing_strip_meta_params(j #>> '{}'));
    ELSE RETURN j;
  END CASE;
END $$;

ALTER TABLE public.marketing_consent_events
  ADD COLUMN IF NOT EXISTS revision bigint,
  ADD COLUMN IF NOT EXISTS expected_revision bigint;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_consent_events_subject_revision_uq
  ON public.marketing_consent_events (subject_id, revision) WHERE revision IS NOT NULL;
ALTER TABLE public.marketing_consent_events DROP CONSTRAINT IF EXISTS marketing_consent_events_subject_id_client_seq_key;
COMMENT ON COLUMN public.marketing_consent_events.client_seq IS 'Informativo (#322 correção): não ordena nem decide; ordem = revision do servidor.';
COMMENT ON COLUMN public.marketing_consent_events.revision IS 'Revisão do servidor por sujeito (max+1 sob lock). Autoridade de ordenação.';

DROP FUNCTION IF EXISTS public.marketing_consent_record(uuid,text,text,text,text,text,text,bigint,timestamptz,uuid,text,text);
DROP FUNCTION IF EXISTS public.marketing_consent_bind(uuid,text,text);
DROP FUNCTION IF EXISTS public.marketing_consent_effective(uuid,timestamptz);

CREATE FUNCTION public.marketing_consent_effective(p_subject uuid, p_at timestamptz)
RETURNS TABLE (event_id bigint, state text, revision bigint, valid_grant boolean, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.state, e.revision,
    (e.state = 'granted' AND p.portal IS NOT NULL
      AND e.server_received_at >= p.valid_from AND (p.valid_to IS NULL OR e.server_received_at < p.valid_to)
      AND (p.valid_to IS NULL OR p_at < p.valid_to)
      AND e.server_received_at + make_interval(days => p.ttl_days) > p_at) AS valid_grant,
    CASE WHEN p.portal IS NOT NULL THEN
      least(e.server_received_at + make_interval(days => p.ttl_days), coalesce(p.valid_to, 'infinity'::timestamptz)) END
  FROM public.marketing_consent_events e
  LEFT JOIN public.marketing_consent_policies p ON p.portal = e.portal AND p.policy_version = e.policy_version
  WHERE e.subject_id = p_subject AND e.server_received_at <= p_at
  ORDER BY coalesce(e.revision, 0) DESC, e.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.marketing_consent_receipt(p_token text, p_event bigint, p_revision bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_event::text || '.' || p_revision::text || '.'
      || encode(extensions.digest('mcr1:' || p_token || ':' || p_event::text || ':' || p_revision::text, 'sha256'), 'hex');
$$;

CREATE FUNCTION public.marketing_consent_record(
  p_company uuid, p_portal text, p_token text, p_state text, p_purpose text,
  p_policy text, p_banner text, p_seq bigint, p_client_at timestamptz, p_idem uuid, p_origin text, p_path text,
  p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.marketing_consent_subjects%ROWTYPE; v_ev public.marketing_consent_events%ROWTYPE;
        v_eff record; v_replay boolean := false; v_hash text; v_cur bigint; v_allowed boolean;
BEGIN
  IF NOT public.marketing_consent_scope_ok(p_company, p_portal) THEN RETURN jsonb_build_object('ok', false, 'error', 'scope_invalid'); END IF;
  IF p_state IS NULL OR p_state NOT IN ('granted','denied','revoked') THEN RETURN jsonb_build_object('ok', false, 'error', 'state_invalid'); END IF;
  IF p_purpose IS DISTINCT FROM 'meta_ads' THEN RETURN jsonb_build_object('ok', false, 'error', 'purpose_invalid'); END IF;
  IF p_idem IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required'); END IF;
  IF p_seq IS NULL OR p_seq <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'seq_invalid'); END IF;
  IF coalesce(length(p_policy),0) NOT BETWEEN 1 AND 64 OR coalesce(length(p_banner),0) NOT BETWEEN 1 AND 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_invalid'); END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'subject_invalid'); END IF;
  IF p_state = 'granted' AND (p_expected_revision IS NULL OR p_expected_revision < 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expected_revision_required'); END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('mcs-tok:' || v_hash, 0));
  SELECT * INTO v_sub FROM public.marketing_consent_subjects WHERE token_hash = v_hash;
  IF v_sub.id IS NULL THEN
    INSERT INTO public.marketing_consent_subjects (company_id, portal, token_hash) VALUES (p_company, p_portal, v_hash) RETURNING * INTO v_sub;
  ELSIF v_sub.company_id <> p_company OR v_sub.portal <> p_portal THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subject_invalid');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mcs:' || v_sub.id::text, 0));
  SELECT * INTO v_ev FROM public.marketing_consent_events WHERE subject_id = v_sub.id AND idempotency_key = p_idem;
  IF v_ev.id IS NOT NULL THEN
    IF v_ev.state <> p_state OR v_ev.policy_version <> p_policy OR v_ev.banner_version <> p_banner
       OR v_ev.expected_revision IS DISTINCT FROM p_expected_revision THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict'); END IF;
    v_replay := true;
  ELSE
    SELECT coalesce(max(revision), 0) INTO v_cur FROM public.marketing_consent_events WHERE subject_id = v_sub.id;
    IF p_state = 'granted' THEN
      IF NOT EXISTS (SELECT 1 FROM public.marketing_consent_policies
           WHERE portal = p_portal AND policy_version = p_policy AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'policy_invalid'); END IF;
      IF p_expected_revision <> v_cur THEN
        SELECT * INTO v_eff FROM public.marketing_consent_effective(v_sub.id, clock_timestamp());
        RETURN jsonb_build_object('ok', false, 'error', 'revision_conflict', 'effective_state', v_eff.state, 'effective_revision', v_cur);
      END IF;
    END IF;
    INSERT INTO public.marketing_consent_events (subject_id, company_id, portal, state, purpose, policy_version, banner_version,
      client_seq, client_decided_at, idempotency_key, origin, path, revision, expected_revision)
    VALUES (v_sub.id, p_company, p_portal, p_state, 'meta_ads', p_policy, p_banner, p_seq, p_client_at, p_idem,
      left(p_origin, 200), left(p_path, 300), v_cur + 1, p_expected_revision) RETURNING * INTO v_ev;
  END IF;
  SELECT * INTO v_eff FROM public.marketing_consent_effective(v_sub.id, clock_timestamp());
  v_allowed := v_ev.state = 'granted' AND v_eff.event_id = v_ev.id AND coalesce(v_eff.valid_grant, false);
  RETURN jsonb_build_object('ok', true, 'replay', v_replay, 'decision_id', v_ev.id, 'revision', v_ev.revision,
    'recorded_state', v_ev.state, 'server_received_at', v_ev.server_received_at,
    'effective_state', v_eff.state, 'effective_decision_id', v_eff.event_id, 'effective_revision', v_eff.revision,
    'marketing_allowed', v_allowed,
    'expires_at', CASE WHEN v_allowed THEN v_eff.expires_at END,
    'consent_receipt', CASE WHEN v_allowed THEN public.marketing_consent_receipt(p_token, v_ev.id, v_ev.revision) END);
END $$;

CREATE FUNCTION public.marketing_consent_bind(p_company uuid, p_portal text, p_token text, p_receipt text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.marketing_consent_subjects%ROWTYPE; v_eff record; m text[]; v_ev public.marketing_consent_events%ROWTYPE;
BEGIN
  IF NOT public.marketing_consent_scope_ok(p_company, p_portal) THEN RETURN jsonb_build_object('proof', false, 'reason', 'scope_invalid'); END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('proof', false, 'reason', 'no_token'); END IF;
  m := regexp_match(coalesce(p_receipt, ''), '^([0-9]{1,18})\.([0-9]{1,18})\.([0-9a-f]{64})$');
  IF m IS NULL THEN RETURN jsonb_build_object('proof', false, 'reason', 'no_receipt'); END IF;
  SELECT * INTO v_sub FROM public.marketing_consent_subjects WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  IF v_sub.id IS NULL OR v_sub.company_id <> p_company OR v_sub.portal <> p_portal THEN
    RETURN jsonb_build_object('proof', false, 'reason', 'subject_invalid'); END IF;
  IF public.marketing_consent_receipt(p_token, m[1]::bigint, m[2]::bigint) <> p_receipt THEN
    RETURN jsonb_build_object('proof', false, 'reason', 'receipt_invalid'); END IF;
  SELECT * INTO v_ev FROM public.marketing_consent_events WHERE id = m[1]::bigint;
  IF v_ev.id IS NULL OR v_ev.subject_id <> v_sub.id OR v_ev.revision IS DISTINCT FROM m[2]::bigint OR v_ev.state <> 'granted' THEN
    RETURN jsonb_build_object('proof', false, 'reason', 'receipt_invalid'); END IF;
  SELECT * INTO v_eff FROM public.marketing_consent_effective(v_sub.id, clock_timestamp());
  IF v_eff.event_id IS DISTINCT FROM v_ev.id THEN RETURN jsonb_build_object('proof', false, 'reason', 'superseded'); END IF;
  IF NOT coalesce(v_eff.valid_grant, false) THEN RETURN jsonb_build_object('proof', false, 'reason', 'expired_or_policy'); END IF;
  RETURN jsonb_build_object('proof', true, 'subject_id', v_sub.id, 'event_id', v_ev.id);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_consent_binding_valid(
  p_subject uuid, p_event bigint, p_company uuid, p_portal text, p_captured_at timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.marketing_consent_events%ROWTYPE; cap record; cur record;
BEGIN
  IF p_subject IS NULL OR p_event IS NULL OR p_company IS NULL OR p_portal IS NULL OR p_captured_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO e FROM public.marketing_consent_events WHERE id = p_event;
  IF e.id IS NULL OR e.subject_id <> p_subject OR e.state <> 'granted' OR e.purpose <> 'meta_ads'
     OR e.company_id <> p_company OR e.portal <> p_portal OR e.revision IS NULL THEN RETURN false; END IF;
  SELECT * INTO cap FROM public.marketing_consent_effective(p_subject, p_captured_at);
  IF cap.event_id IS DISTINCT FROM e.id OR NOT coalesce(cap.valid_grant, false) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_consent_events x WHERE x.subject_id = p_subject AND x.id <> e.id
             AND (coalesce(x.revision, 0) > e.revision OR x.id > e.id)) THEN RETURN false; END IF;
  SELECT * INTO cur FROM public.marketing_consent_effective(p_subject, clock_timestamp());
  RETURN cur.event_id = e.id AND coalesce(cur.valid_grant, false);
END $$;

CREATE OR REPLACE FUNCTION public._marketing_consent_capture_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_company uuid; v_ok boolean := false; v_prev bigint; v_dup boolean := false;
BEGIN
  BEGIN v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  EXCEPTION WHEN OTHERS THEN v_role := ''; END;
  IF TG_TABLE_NAME = 'redirect_log' THEN v_company := NEW.consent_company_id; ELSE v_company := NEW.company_id; END IF;
  IF v_role = 'service_role' AND NEW.consent_subject_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('mcs:' || NEW.consent_subject_id::text, 0));
    v_ok := coalesce(public.marketing_consent_binding_valid(NEW.consent_subject_id, NEW.consent_event_id, v_company, NEW.consent_portal, clock_timestamp()), false);
    IF v_ok AND NEW.client_event_id IS NOT NULL THEN
      IF TG_TABLE_NAME = 'redirect_log' THEN
        SELECT true, consent_event_id INTO v_dup, v_prev FROM public.redirect_log WHERE client_event_id = NEW.client_event_id ORDER BY created_at LIMIT 1;
      ELSE
        SELECT true, consent_event_id INTO v_dup, v_prev FROM public.lead_capture WHERE client_event_id = NEW.client_event_id ORDER BY created_at LIMIT 1;
      END IF;
      IF coalesce(v_dup, false) AND v_prev IS DISTINCT FROM NEW.consent_event_id THEN v_ok := false; END IF;
    END IF;
  END IF;
  IF NOT v_ok THEN
    NEW.consent_subject_id := NULL; NEW.consent_event_id := NULL; NEW.consent_portal := NULL;
    NEW.fbc := NULL; NEW.fbp := NULL;
    IF TG_TABLE_NAME = 'redirect_log' THEN
      NEW.consent_company_id := NULL;
      NEW.referrer := public.marketing_strip_meta_params(NEW.referrer);
      NEW.destination_url := public.marketing_strip_meta_params(NEW.destination_url);
    ELSE
      NEW.raw := public.marketing_strip_meta_json(NEW.raw);
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.marketing_pct_decode_key(text), public.marketing_is_meta_key(text), public.marketing_filter_qs(text),
  public.marketing_strip_meta_params(text), public.marketing_strip_meta_json(jsonb),
  public.marketing_consent_effective(uuid,timestamptz), public.marketing_consent_receipt(text,bigint,bigint),
  public.marketing_consent_record(uuid,text,text,text,text,text,text,bigint,timestamptz,uuid,text,text,bigint),
  public.marketing_consent_bind(uuid,text,text,text), public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz),
  public._marketing_consent_capture_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_pct_decode_key(text), public.marketing_is_meta_key(text), public.marketing_filter_qs(text),
  public.marketing_strip_meta_params(text), public.marketing_strip_meta_json(jsonb),
  public.marketing_consent_effective(uuid,timestamptz), public.marketing_consent_receipt(text,bigint,bigint),
  public.marketing_consent_record(uuid,text,text,text,text,text,text,bigint,timestamptz,uuid,text,text,bigint),
  public.marketing_consent_bind(uuid,text,text,text), public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz)
  TO service_role;
