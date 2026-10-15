-- Issue #320 P1 — espelho fiel (pg_get_functiondef em Live, 2026-10-15) das 6 funções-base aplicadas na
-- 0164 original cujo ficheiro não ficou no repo. Sem mudança comportamental.
-- Ordem: 0164_issue320_capi_p1_gaps cria tabelas/colunas e funções PL/pgSQL que as chamam (late binding:
-- PL/pgSQL só resolve chamadas em runtime), por isso numa instalação nova 0164 aplica sem estas funções e
-- esta migração completa o conjunto antes de qualquer execução. Nenhuma função fica dependente de DDL escondido em Live.

-- Fail-closed: linha de controlo nasce suspensa numa instalação nova (no-op em Live, linha já existe).
INSERT INTO public.capi_dispatch_control (id, suspended, reason, updated_by)
VALUES (1, true, 'Issue #320 P1 — suspensão até verificação do Pedro; sem retoma automática', 'migration_0164')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.capi_dispatch_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT NOT suspended FROM public.capi_dispatch_control WHERE id = 1), false);
$function$;

CREATE OR REPLACE FUNCTION public.capi_consent_proof(p_lead_id uuid, p_event_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT false;
$function$;

CREATE OR REPLACE FUNCTION public.capi_lead_block_reason(p_lead_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN 'suspended'; END IF;
  SELECT id, kind, created_at, capi_status INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL THEN RETURN 'not_found'; END IF;
  IF l.kind = 'redirect_click' THEN RETURN 'wrong_kind'; END IF;
  IF l.created_at < now() - interval '7 days' THEN RETURN 'expired'; END IF;
  IF NOT public.capi_consent_proof(l.id, 'ViewContent') THEN RETURN 'no_consent'; END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public._capi_classify_lead(p_lead_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record; v_status text; v_reason text;
BEGIN
  SELECT id, kind, created_at, capi_status INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF l.id IS NULL OR l.capi_status = 'sent' THEN RETURN l.capi_status; END IF;
  IF l.kind = 'redirect_click' THEN v_status := 'blocked_wrong_kind'; v_reason := 'redirect_click não gera ViewContent (D-ERP280.1)';
  ELSIF l.created_at < now() - interval '7 days' THEN v_status := 'expired'; v_reason := 'fora do prazo Meta de 7 dias';
  ELSIF NOT public.capi_consent_proof(l.id, 'ViewContent') THEN v_status := 'blocked_no_consent'; v_reason := 'sem prova de consentimento marketing por interacção';
  ELSE RETURN NULL; END IF;
  UPDATE public.leads SET capi_status_before = coalesce(capi_status_before, coalesce(capi_status, 'null')),
         capi_status = v_status, capi_block_reason = v_reason, capi_classified_at = now()
   WHERE id = l.id AND capi_status IS DISTINCT FROM 'sent';
  RETURN v_status;
END $function$;

CREATE OR REPLACE FUNCTION public.capi_recover_processing(p_older_than_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v text; n_blocked int := 0; n_retry int := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE capi_status = 'processing'
            AND capi_sent_at < now() - make_interval(mins => greatest(p_older_than_minutes, 1))
            FOR UPDATE SKIP LOCKED LOOP
    v := public._capi_classify_lead(r.id);
    IF v IS NULL THEN
      IF public.capi_dispatch_allowed() THEN
        UPDATE public.leads SET capi_status = 'retry' WHERE id = r.id AND capi_status = 'processing';
        n_retry := n_retry + 1;
      END IF;
    ELSE n_blocked := n_blocked + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('blocked', n_blocked, 'retry', n_retry);
END $function$;

CREATE OR REPLACE FUNCTION public.capi_record_meta_error(p_lead_id uuid, p_code integer, p_subcode integer, p_detail text, p_source text DEFAULT 'process-leads-capi'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_code = 100 AND p_subcode = 33 THEN
    IF p_lead_id IS NOT NULL THEN
      UPDATE public.leads SET capi_status_before = coalesce(capi_status_before, coalesce(capi_status,'null')),
             capi_status = 'error_meta_access', capi_block_reason = 'Meta 100/33: objecto inexistente ou sem permissão',
             capi_classified_at = now()
       WHERE id = p_lead_id AND capi_status IS DISTINCT FROM 'sent';
    END IF;
    INSERT INTO public.capi_alerts (source, lead_id, meta_code, meta_subcode, kind, detail)
    VALUES (coalesce(p_source,'unknown'), p_lead_id, p_code, p_subcode, 'meta_access_100_33', left(p_detail, 500));
    RETURN 'error_meta_access';
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.capi_dispatch_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_consent_proof(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_lead_block_reason(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._capi_classify_lead(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_recover_processing(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_record_meta_error(uuid, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_dispatch_allowed() TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_consent_proof(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_lead_block_reason(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._capi_classify_lead(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_recover_processing(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_record_meta_error(uuid, integer, integer, text, text) TO service_role;