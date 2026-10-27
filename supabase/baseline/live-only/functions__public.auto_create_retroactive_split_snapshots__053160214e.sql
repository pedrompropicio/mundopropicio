-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.auto_create_retroactive_split_snapshots()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "abe27dfa85d8e9987e120291e39108d2f269e0c5dce4d9c75cec49029f6958df", "live_properties_sha256": "ffff154b4b6eb66391e433be67eec28e78211109d8f04fb1b9acb780bb0f83b0", "oid": 53653, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "ea5194651a00556b8c67509f38bdce58f826c2f503fad51054df0dc9ddbc3201", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION ed484f556cae0977abadaa7ece1e631eba800f41c67a799e5c3918590270b5eb
CREATE OR REPLACE FUNCTION public.auto_create_retroactive_split_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_master_version RECORD; v_split_payload jsonb; v_split_version_id uuid; v_now timestamptz := now();
BEGIN
  IF NEW.parent_event_id IS NULL THEN RETURN NEW; END IF;
  FOR v_master_version IN
    SELECT mv.* FROM public.bp_versions mv
     WHERE mv.event_id = NEW.parent_event_id
       AND NOT EXISTS (SELECT 1 FROM public.bp_versions sv WHERE sv.event_id = NEW.id AND sv.cascaded_from_version_id = mv.id)
     ORDER BY mv.version_number ASC
  LOOP
    BEGIN
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status, 'parent_event_id', NEW.parent_event_id),
        'snapshot_taken_at', v_now, 'cascaded_from_event_id', NEW.parent_event_id,
        'is_retroactive_snapshot', true,
        'forecasts', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at) FROM public.event_forecasts f WHERE f.event_id = NEW.id), '[]'::jsonb));
      INSERT INTO public.bp_versions (event_id, version_number, state, created_by, created_by_label,
        description, snapshot_payload, approved_at, approved_by, superseded_at, superseded_by_version_id,
        archived_at, cascaded_from_version_id, scenario_label, scenario_assumptions, is_pinned_scenario, is_retroactive_snapshot)
      VALUES (NEW.id, v_master_version.version_number, v_master_version.state, NULL, 'sistema (split retroativo)',
        format('Snapshot retroativo — Split adicionado após v%s do Master', v_master_version.version_number),
        v_split_payload, v_master_version.approved_at, v_master_version.approved_by,
        v_master_version.superseded_at, v_master_version.superseded_by_version_id, v_master_version.archived_at,
        v_master_version.id, v_master_version.scenario_label, v_master_version.scenario_assumptions, false, true)
      RETURNING id INTO v_split_version_id;
      INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
      VALUES (v_split_version_id, NEW.id, 'retroactive_snapshot_created', NULL, 'sistema (split retroativo)',
        jsonb_build_object('master_version_id', v_master_version.id, 'master_event_id', NEW.parent_event_id,
          'master_version_number', v_master_version.version_number, 'master_state', v_master_version.state, 'split_event_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_create_retroactive_split_snapshots failed for split % / master version %: %', NEW.id, v_master_version.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END; $function$
;

ALTER FUNCTION public.auto_create_retroactive_split_snapshots() OWNER TO "postgres";
-- END OPERATION ed484f556cae0977abadaa7ece1e631eba800f41c67a799e5c3918590270b5eb
