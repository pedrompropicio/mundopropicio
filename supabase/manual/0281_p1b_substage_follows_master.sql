-- P1b (D-ERP319): sub-event stage always derives from the root master; stage RPCs act only on masters;
-- master checklist aggregates hard and soft blockers of master + sub-events. No DML; sub-event stamps are ignored, not cleared.
CREATE OR REPLACE FUNCTION public.event_stage(p_event_id uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; last_day date; hops int:=0;
BEGIN
  e:=public._event_stage_access(p_event_id);
  -- P1b: walk to the root master (bounded); the sub-event's own stamps/status are ignored.
  WHILE e.parent_event_id IS NOT NULL LOOP
    hops:=hops+1;
    IF hops>16 THEN RAISE EXCEPTION 'event_hierarchy_cycle'; END IF;
    SELECT * INTO e FROM public.events WHERE id=e.parent_event_id;
    IF e.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  END LOOP;
  IF e.status='cancelled' THEN RETURN 'cancelado'; END IF;
  IF e.historical_at IS NOT NULL THEN RETURN 'historico'; END IF;
  IF e.closed_at IS NOT NULL AND e.status='completed' THEN RETURN 'fechado'; END IF;
  IF e.status='planning' THEN RETURN 'planeamento'; END IF;
  -- isEventRealized: max own/child civil date; D-ERP288 server timezone.
  SELECT max(date) INTO last_day FROM public.events WHERE (id=e.id OR parent_event_id=e.id) AND company_id=e.company_id;
  IF e.status='completed' OR last_day<(now() AT TIME ZONE 'Europe/Lisbon')::date THEN RETURN 'em_fecho'; END IF;
  RETURN 'em_curso';
END $$;

CREATE OR REPLACE FUNCTION public.event_close_checklist(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; blockers jsonb; total_n int; unsealed_n int; cache_n int; unfrozen_n int; hard_n int; bp_n int; bp_saldo numeric; hard_values jsonb; blks jsonb;
BEGIN
  e:=public._event_stage_access(p_event_id);
  SELECT count(*), count(*) FILTER(WHERE NOT is_sealed OR sealed_snapshot IS NULL) INTO total_n,unsealed_n FROM public.event_settlements WHERE event_id=e.id AND company_id=e.company_id;
  -- Canonical frozen expression from _cache_resolve_lines: city overrides config.
  -- Root config applies to each direct city, even when no cache BP line exists yet.
  WITH scope AS (SELECT id FROM public.events WHERE (id=e.id OR parent_event_id=e.id) AND company_id=e.company_id), configured AS (
    SELECT c.id,coalesce(s.is_finalized,c.is_finalized,false) frozen
    FROM public.event_cache_configs c
    JOIN public.events target ON target.id=c.event_id OR target.parent_event_id=c.event_id
    LEFT JOIN public.event_cache_city_settlements s ON s.cache_config_id=c.id AND s.event_id=target.id
    WHERE c.company_id=e.company_id AND target.id IN (SELECT id FROM scope)
      AND (target.id<>c.event_id OR NOT EXISTS(SELECT 1 FROM public.events child WHERE child.parent_event_id=c.event_id))
  ) SELECT count(*),count(*) FILTER(WHERE NOT frozen) INTO cache_n,unfrozen_n FROM configured;
  -- P1b: event_close_blockers of the event and each direct sub-event (same company); hard lists merged per key
  -- with distinct elements (circuit_accounts is already family-scoped), soft BP count and saldo summed.
  SELECT jsonb_agg(public.event_close_blockers(x.id)) INTO blks
    FROM public.events x WHERE (x.id=e.id OR x.parent_event_id=e.id) AND x.company_id=e.company_id;
  IF blks IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(blks) t(b) WHERE jsonb_typeof(b)<>'object' OR jsonb_typeof(b->'hard')<>'object' OR b#>>'{soft,bp_lines_unreviewed,count}' IS NULL) THEN
    RAISE EXCEPTION 'event_checklist_source_unavailable';
  END IF;
  SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) INTO hard_values FROM (
    SELECT kv.key k, coalesce(jsonb_agg(DISTINCT el) FILTER(WHERE el IS NOT NULL),'[]'::jsonb) v
    FROM jsonb_array_elements(blks) t(b) CROSS JOIN LATERAL jsonb_each(t.b->'hard') kv
    LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(kv.value)='array' THEN kv.value ELSE '[]'::jsonb END) el ON true
    GROUP BY kv.key) h;
  SELECT coalesce(sum(jsonb_array_length(value)),0) INTO hard_n FROM jsonb_each(hard_values);
  SELECT coalesce(sum((b#>>'{soft,bp_lines_unreviewed,count}')::int),0), sum(coalesce((b#>>'{soft,bp_lines_unreviewed,saldo_net}')::numeric,0))
    INTO bp_n,bp_saldo FROM jsonb_array_elements(blks) t(b);
  RETURN jsonb_build_object('ok',unsealed_n=0 AND unfrozen_n=0 AND bp_n=0 AND hard_n=0,
    'settlements',jsonb_build_object('ok',unsealed_n=0,'total',total_n,'unsealed_or_missing_snapshot',unsealed_n),
    'cache',jsonb_build_object('ok',unfrozen_n=0,'configured_targets',cache_n,'unfrozen',unfrozen_n),
    'bp_lines',jsonb_build_object('ok',bp_n=0,'count',bp_n,'saldo_net',bp_saldo),
    'hard_blockers',jsonb_build_object('ok',hard_n=0,'count',hard_n,'values',hard_values));
END $$;

CREATE OR REPLACE FUNCTION public.close_event(p_event_id uuid,p_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; checks jsonb; previous_op text:=coalesce(current_setting('app.event_stage_op',true),'');
BEGIN
  PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
  e:=public._event_stage_access(p_event_id,'close');
  IF e.parent_event_id IS NOT NULL THEN RAISE EXCEPTION 'event_stage_act_on_master: %',e.parent_event_id; END IF;
  IF e.closed_at IS NOT NULL THEN RAISE EXCEPTION 'event_already_closed'; END IF;
  IF e.status='cancelled' OR e.historical_at IS NOT NULL THEN RAISE EXCEPTION 'event_stage_close_invalid'; END IF;
  -- Lock checklist source parents before reading; existing child guards share parent locks.
  PERFORM 1 FROM public.event_settlements WHERE event_id=e.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.event_cache_configs WHERE event_id=e.id OR event_id IN(SELECT id FROM public.events WHERE parent_event_id=e.id) ORDER BY id FOR UPDATE;
  checks:=public.event_close_checklist(e.id);
  IF (checks->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'event_close_checklist_failed: %',checks; END IF;
  PERFORM set_config('app.event_stage_op',e.id::text||':'||txid_current()::text,true);
  UPDATE public.events SET closed_at=now(),closed_by=auth.uid(),status='completed' WHERE id=e.id;
  PERFORM set_config('app.event_stage_op',previous_op,true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,company_id,metadata)
    VALUES('events',e.id::text,'event_closed',auth.uid()::text,e.company_id,jsonb_build_object('reason',p_reason,'checklist',checks));
  RETURN jsonb_build_object('ok',true,'event_id',e.id,'checklist',checks);
END $$;
CREATE OR REPLACE FUNCTION public.reopen_event_closure(p_event_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; previous_op text:=coalesce(current_setting('app.event_stage_op',true),'');
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'event_reopen_reason_required'; END IF;
  PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
  e:=public._event_stage_access(p_event_id,'reopen');
  IF e.parent_event_id IS NOT NULL THEN RAISE EXCEPTION 'event_stage_act_on_master: %',e.parent_event_id; END IF;
  IF e.closed_at IS NULL THEN RAISE EXCEPTION 'event_not_closed'; END IF;
  PERFORM set_config('app.event_stage_op',e.id::text||':'||txid_current()::text,true);
  UPDATE public.events SET closed_at=NULL,closed_by=NULL WHERE id=e.id;
  PERFORM set_config('app.event_stage_op',previous_op,true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,company_id,metadata)
    VALUES('events',e.id::text,'event_closure_reopened',auth.uid()::text,e.company_id,jsonb_build_object('reason',p_reason));
  RETURN jsonb_build_object('ok',true,'event_id',e.id);
END $$;
CREATE OR REPLACE FUNCTION public.mark_event_historical(p_event_id uuid,p_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; previous_op text:=coalesce(current_setting('app.event_stage_op',true),'');
BEGIN
  PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
  e:=public._event_stage_access(p_event_id,'admin');
  IF e.parent_event_id IS NOT NULL THEN RAISE EXCEPTION 'event_stage_act_on_master: %',e.parent_event_id; END IF;
  IF e.historical_at IS NOT NULL THEN RAISE EXCEPTION 'event_already_historical'; END IF;
  PERFORM set_config('app.event_stage_op',e.id::text||':'||txid_current()::text,true);
  UPDATE public.events SET historical_at=now(),historical_by=auth.uid() WHERE id=e.id;
  PERFORM set_config('app.event_stage_op',previous_op,true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,company_id,metadata)
    VALUES('events',e.id::text,'event_marked_historical',auth.uid()::text,e.company_id,jsonb_build_object('reason',p_reason));
  RETURN jsonb_build_object('ok',true,'event_id',e.id);
END $$;
CREATE OR REPLACE FUNCTION public.unmark_event_historical(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; previous_op text:=coalesce(current_setting('app.event_stage_op',true),'');
BEGIN
  PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
  e:=public._event_stage_access(p_event_id,'admin');
  IF e.parent_event_id IS NOT NULL THEN RAISE EXCEPTION 'event_stage_act_on_master: %',e.parent_event_id; END IF;
  IF e.historical_at IS NULL THEN RAISE EXCEPTION 'event_not_historical'; END IF;
  PERFORM set_config('app.event_stage_op',e.id::text||':'||txid_current()::text,true);
  UPDATE public.events SET historical_at=NULL,historical_by=NULL WHERE id=e.id;
  PERFORM set_config('app.event_stage_op',previous_op,true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,company_id)
    VALUES('events',e.id::text,'event_unmarked_historical',auth.uid()::text,e.company_id);
  RETURN jsonb_build_object('ok',true,'event_id',e.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid),public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) FROM anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.event_stage(uuid),public.event_close_checklist(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.close_event(uuid,text),public.reopen_event_closure(uuid,text),public.mark_event_historical(uuid,text),public.unmark_event_historical(uuid) TO authenticated;
