-- Phase 11 (spec) — Retroactive snapshots for Splits added after Master versions exist
-- When a new Split is created under a Master that already has bp_versions,
-- create retroactive snapshots of the Split (matching version_number + state)
-- linked to each Master version via cascaded_from_version_id.

CREATE OR REPLACE FUNCTION public.auto_create_retroactive_split_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_master_version RECORD;
  v_split_payload jsonb;
  v_split_version_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Only when a Split is being created (parent_event_id IS NOT NULL)
  IF NEW.parent_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate over all Master versions that don't yet have a cascaded snapshot for this split
  FOR v_master_version IN
    SELECT mv.*
      FROM public.bp_versions mv
     WHERE mv.event_id = NEW.parent_event_id
       AND NOT EXISTS (
         SELECT 1 FROM public.bp_versions sv
          WHERE sv.event_id = NEW.id
            AND sv.cascaded_from_version_id = mv.id
       )
     ORDER BY mv.version_number ASC
  LOOP
    BEGIN
      -- Build minimal snapshot payload for the new Split.
      -- Forecasts will be empty at this moment (Split was just created), but
      -- the retroactive snapshot still preserves the structural link.
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object(
          'id', NEW.id,
          'name', NEW.name,
          'status', NEW.status,
          'parent_event_id', NEW.parent_event_id
        ),
        'snapshot_taken_at', v_now,
        'cascaded_from_event_id', NEW.parent_event_id,
        'is_retroactive_snapshot', true,
        'forecasts', COALESCE((
          SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
            FROM public.event_forecasts f
           WHERE f.event_id = NEW.id
        ), '[]'::jsonb)
      );

      INSERT INTO public.bp_versions (
        event_id, version_number, state, created_by, created_by_label,
        description, snapshot_payload,
        approved_at, approved_by,
        superseded_at, superseded_by_version_id,
        archived_at,
        cascaded_from_version_id,
        scenario_label, scenario_assumptions, is_pinned_scenario,
        is_retroactive_snapshot
      )
      VALUES (
        NEW.id,
        v_master_version.version_number,
        v_master_version.state,
        NULL, 'sistema (split retroativo)',
        format('Snapshot retroativo — Split adicionado após v%s do Master', v_master_version.version_number),
        v_split_payload,
        v_master_version.approved_at, v_master_version.approved_by,
        v_master_version.superseded_at, v_master_version.superseded_by_version_id,
        v_master_version.archived_at,
        v_master_version.id,
        v_master_version.scenario_label,
        v_master_version.scenario_assumptions,
        false,  -- never auto-pin retroactive snapshots
        true
      )
      RETURNING id INTO v_split_version_id;

      INSERT INTO public.bp_version_audit_log (
        version_id, event_id, action, performed_by, performed_by_label, metadata
      ) VALUES (
        v_split_version_id, NEW.id, 'retroactive_snapshot_created',
        NULL, 'sistema (split retroativo)',
        jsonb_build_object(
          'master_version_id', v_master_version.id,
          'master_event_id', NEW.parent_event_id,
          'master_version_number', v_master_version.version_number,
          'master_state', v_master_version.state,
          'split_event_id', NEW.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_create_retroactive_split_snapshots failed for split % / master version %: %',
        NEW.id, v_master_version.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Allow the new audit action in the whitelist (defensive — only inserts if a CHECK constraint exists)
DO $$
BEGIN
  -- No CHECK constraint enforcement currently exists on action; nothing to do.
  NULL;
END $$;

DROP TRIGGER IF EXISTS trg_auto_create_retroactive_split_snapshots ON public.events;
CREATE TRIGGER trg_auto_create_retroactive_split_snapshots
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_retroactive_split_snapshots();