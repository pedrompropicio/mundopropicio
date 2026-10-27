-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.auto_create_initial_bp_version()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e0fba8c9c0b81ff66e1c83313b30dd0e6e3268a95eb283e9d0925de6a90ef7b3", "live_properties_sha256": "5d20afc587e44f982a8123c18566c3e94aa0d574b82512dac8be940b2ef05b91", "oid": 53652, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "1897fc2d3e468bf64792063ba49a7fa2b2caf480360fd1450f3471a1445bee1f", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 38910951630dc8e199475f0cd2138848f7a09cf848ecc6b01866ea61e12ef31f
CREATE OR REPLACE FUNCTION public.auto_create_initial_bp_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_should_create_initial boolean := false;
  v_should_snapshot_closing boolean := false;
  v_should_snapshot_reopen boolean := false;
  v_has_versions boolean := false;
  v_description text;
BEGIN
  IF NEW.parent_event_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id) INTO v_has_versions;
  IF NEW.status IN ('confirmed', 'active') THEN
    IF TG_OP = 'INSERT' THEN v_should_create_initial := NOT v_has_versions;
    ELSIF TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'active'))
      AND NEW.status IN ('confirmed', 'active') AND NOT v_has_versions THEN
      v_should_create_initial := true;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'active' AND NEW.status = 'completed' THEN v_should_snapshot_closing := true; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'completed' AND NEW.status IN ('active', 'confirmed') THEN v_should_snapshot_reopen := true; END IF;
  IF v_should_create_initial THEN
    BEGIN PERFORM public.create_bp_snapshot(_event_id := NEW.id,
      _description := 'Versão inicial — auto-criada ao ' || CASE NEW.status WHEN 'confirmed' THEN 'confirmar evento' ELSE 'ativar evento' END,
      _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto v1)');
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto initial failed for %: %', NEW.id, SQLERRM; END;
  END IF;
  IF v_should_snapshot_closing THEN
    IF NOT EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id AND state = 'active' AND description LIKE '%Fecho automático%') THEN
      BEGIN v_description := 'Fecho automático — snapshot ao concluir evento (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
      PERFORM public.create_bp_snapshot(_event_id := NEW.id, _description := v_description,
        _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto fecho)');
      EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto closing failed for %: %', NEW.id, SQLERRM; END;
    END IF;
  END IF;
  IF v_should_snapshot_reopen THEN
    BEGIN v_description := 'Reabertura — snapshot ao reabrir evento concluído (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
    PERFORM public.create_bp_snapshot(_event_id := NEW.id, _description := v_description,
      _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto reabertura)');
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto reopen failed for %: %', NEW.id, SQLERRM; END;
  END IF;
  RETURN NEW;
END; $function$
;

ALTER FUNCTION public.auto_create_initial_bp_version() OWNER TO "postgres";
-- END OPERATION 38910951630dc8e199475f0cd2138848f7a09cf848ecc6b01866ea61e12ef31f
