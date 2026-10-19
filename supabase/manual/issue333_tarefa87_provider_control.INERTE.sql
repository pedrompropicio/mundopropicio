-- TASK87 CANDIDATE ONLY. Execute solely in disposable local PostgreSQL.
-- Not a registered migration; Cloud application needs separate controller review.
BEGIN;
CREATE TABLE public.data_entry_analysis_control_333 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 state text NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','ready','paused_credit','denied_provider','unavailable')),
 enabled boolean NOT NULL DEFAULT false,
 reviewed boolean NOT NULL DEFAULT false,
 active_claim uuid,
 stage text NOT NULL DEFAULT 'idle' CHECK (stage IN ('idle','claimed','post_started','uncertain')),
 reason_code text NOT NULL DEFAULT 'closed' CHECK (reason_code IN ('closed','none','success','request_refused','invalid_response','before_post_failure','cancelled_before_post','cancelled_after_post','transport_uncertain','credit_denied','provider_denied','provider_unavailable','http_failure')),
 upstream_status integer CHECK (upstream_status BETWEEN 100 AND 599),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((active_claim IS NULL) = (stage = 'idle')),
 CHECK (state <> 'ready' OR (enabled AND reviewed))
);
GRANT SELECT ON public.data_entry_analysis_control_333 TO service_role;
REVOKE ALL ON public.data_entry_analysis_control_333 FROM PUBLIC, anon, authenticated;
ALTER TABLE public.data_entry_analysis_control_333 ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_control_service_read_333 ON public.data_entry_analysis_control_333 FOR SELECT TO service_role USING (true);
ALTER TABLE public.data_entry_analysis_control_333 OWNER TO postgres;

CREATE TABLE public.data_entry_analysis_audit_333 (
 revision bigint PRIMARY KEY,
 claim uuid,
 stage text NOT NULL CHECK (stage IN ('idle','claimed','post_started','uncertain')),
 reason_code text NOT NULL CHECK (reason_code IN ('closed','none','success','request_refused','invalid_response','before_post_failure','cancelled_before_post','cancelled_after_post','transport_uncertain','credit_denied','provider_denied','provider_unavailable','http_failure')),
 upstream_status integer CHECK (upstream_status BETWEEN 100 AND 599),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.data_entry_analysis_audit_333 TO service_role;
REVOKE ALL ON public.data_entry_analysis_audit_333 FROM PUBLIC, anon, authenticated;
ALTER TABLE public.data_entry_analysis_audit_333 ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_audit_service_read_333 ON public.data_entry_analysis_audit_333 FOR SELECT TO service_role USING (true);
ALTER TABLE public.data_entry_analysis_audit_333 OWNER TO postgres;
-- Closed by default. No ready/reopen operation is furnished by this candidate.
INSERT INTO public.data_entry_analysis_control_333(singleton) VALUES(true);
INSERT INTO public.data_entry_analysis_audit_333(revision,stage,reason_code) VALUES(1,'idle','closed');

CREATE FUNCTION public.data_entry_analysis_transition_333(p_operation text, p_claim uuid DEFAULT NULL, p_revision bigint DEFAULT NULL, p_outcome text DEFAULT NULL, p_status integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE c public.data_entry_analysis_control_333; old_claim uuid;
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN ('read','claim','post','finish','pause') OR (p_status IS NOT NULL AND p_status NOT BETWEEN 100 AND 599) THEN RAISE EXCEPTION 'analysis_control_payload' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.data_entry_analysis_control_333 WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'analysis_control_missing' USING ERRCODE='42501'; END IF;
 IF p_operation='read' THEN
   IF p_claim IS NOT NULL OR p_revision IS NOT NULL OR p_outcome IS NOT NULL OR p_status IS NOT NULL THEN RAISE EXCEPTION 'analysis_control_payload' USING ERRCODE='22023'; END IF;
 ELSE
   IF p_revision IS NULL OR c.revision<>p_revision THEN RAISE EXCEPTION 'analysis_control_revision' USING ERRCODE='40001'; END IF;
   old_claim:=c.active_claim;
   IF p_operation='claim' THEN
     IF p_claim IS NULL OR p_outcome IS NOT NULL OR p_status IS NOT NULL OR c.state<>'ready' OR NOT c.enabled OR NOT c.reviewed OR c.active_claim IS NOT NULL THEN RAISE EXCEPTION 'analysis_control_closed_or_busy' USING ERRCODE='42501'; END IF;
     c.active_claim:=p_claim; c.stage:='claimed'; c.reason_code:='none'; c.upstream_status:=NULL;
   ELSE
     IF p_claim IS DISTINCT FROM c.active_claim OR (p_operation<>'pause' AND p_claim IS NULL) THEN RAISE EXCEPTION 'analysis_control_claim' USING ERRCODE='42501'; END IF;
     IF p_operation='post' THEN
       IF c.state<>'ready' OR NOT c.enabled OR NOT c.reviewed OR c.stage<>'claimed' OR p_outcome IS NOT NULL OR p_status IS NOT NULL THEN RAISE EXCEPTION 'analysis_control_closed_or_stage' USING ERRCODE='42501'; END IF;
       c.stage:='post_started';
     ELSE
       IF p_outcome IS NULL OR p_outcome NOT IN ('success','request_refused','invalid_response','before_post_failure','cancelled_before_post','cancelled_after_post','transport_uncertain','credit_denied','provider_denied','provider_unavailable','http_failure') THEN RAISE EXCEPTION 'analysis_control_outcome' USING ERRCODE='22023'; END IF;
       IF (p_outcome='credit_denied' AND p_status IS DISTINCT FROM 402) OR (p_outcome='provider_denied' AND p_status IS DISTINCT FROM 403) OR (p_outcome='provider_unavailable' AND p_status IS DISTINCT FROM 404) OR (p_outcome IN ('success','request_refused','invalid_response') AND (p_status IS NULL OR p_status NOT BETWEEN 200 AND 299)) OR (p_outcome IN ('before_post_failure','cancelled_before_post') AND (c.stage<>'claimed' OR p_status IS NOT NULL)) OR (p_outcome IN ('cancelled_after_post','transport_uncertain','http_failure') AND c.stage<>'post_started') OR (p_outcome='http_failure' AND (p_status IS NULL OR p_status<400 OR p_status IN (402,403,404))) THEN RAISE EXCEPTION 'analysis_control_outcome_stage' USING ERRCODE='22023'; END IF;
       IF p_operation='pause' AND p_outcome NOT IN ('credit_denied','provider_denied','provider_unavailable','transport_uncertain') THEN RAISE EXCEPTION 'analysis_control_pause' USING ERRCODE='22023'; END IF;
       c.reason_code:=p_outcome; c.upstream_status:=p_status;
       IF p_outcome='credit_denied' THEN c.state:='paused_credit';
       ELSIF p_outcome='provider_denied' THEN c.state:='denied_provider';
       ELSIF p_outcome IN ('provider_unavailable','transport_uncertain','cancelled_after_post') THEN c.state:='unavailable'; END IF;
       IF c.state<>'ready' THEN c.enabled:=false; END IF;
       IF p_operation='pause' THEN NULL; -- preserve in-flight claim; old completion is fenced by revision
       ELSIF p_outcome IN ('transport_uncertain','cancelled_after_post') THEN c.stage:='uncertain';
       ELSE c.active_claim:=NULL; c.stage:='idle'; END IF;
     END IF;
   END IF;
   c.revision:=c.revision+1; c.changed_at:=clock_timestamp();
   UPDATE public.data_entry_analysis_control_333 SET revision=c.revision,state=c.state,enabled=c.enabled,reviewed=c.reviewed,active_claim=c.active_claim,stage=c.stage,reason_code=c.reason_code,upstream_status=c.upstream_status,changed_at=c.changed_at WHERE singleton;
   INSERT INTO public.data_entry_analysis_audit_333(revision,claim,stage,reason_code,upstream_status) VALUES(c.revision,coalesce(c.active_claim,old_claim),c.stage,c.reason_code,c.upstream_status);
 END IF;
 RETURN jsonb_build_object('revision',c.revision::text,'state',c.state,'enabled',c.enabled,'reviewed',c.reviewed,'claim',c.active_claim,'stage',c.stage,'reason',c.reason_code,'status',c.upstream_status);
END $fn$;
ALTER FUNCTION public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer) TO service_role;
COMMIT;