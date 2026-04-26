-- Phase 11 — Auto-versioning on event lifecycle transitions
-- Extends auto_create_initial_bp_version to also snapshot when:
--   1. active → completed   (final snapshot, "Fecho")
--   2. completed → active   (reopen snapshot, reference)
-- Existing behavior (initial v1 on confirmed/active) is preserved.

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
  v_label text;
BEGIN
  -- Only act on master/standalone (splits inherit via cascade)
  IF NEW.parent_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if any versions already exist for this event
  SELECT EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id)
    INTO v_has_versions;

  -- ─── Case 1: Initial version on confirmed/active ─────────────────────────
  IF NEW.status IN ('confirmed', 'active') THEN
    IF TG_OP = 'INSERT' THEN
      v_should_create_initial := NOT v_has_versions;
    ELSIF TG_OP = 'UPDATE'
      AND (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'active'))
      AND NEW.status IN ('confirmed', 'active')
      AND NOT v_has_versions THEN
      v_should_create_initial := true;
    END IF;
  END IF;

  -- ─── Case 2: Closing snapshot on active → completed ─────────────────────
  IF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'active'
    AND NEW.status = 'completed' THEN
    v_should_snapshot_closing := true;
  END IF;

  -- ─── Case 3: Reopen snapshot on completed → active/confirmed ────────────
  IF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'completed'
    AND NEW.status IN ('active', 'confirmed') THEN
    v_should_snapshot_reopen := true;
  END IF;

  -- Execute snapshots (each in its own block — never let auto-versioning
  -- block the underlying status update).
  IF v_should_create_initial THEN
    BEGIN
      PERFORM public.create_bp_snapshot(
        _event_id := NEW.id,
        _description := 'Versão inicial — auto-criada ao ' ||
          CASE NEW.status WHEN 'confirmed' THEN 'confirmar evento' ELSE 'ativar evento' END,
        _approve_immediately := true,
        _created_by := NULL,
        _created_by_label := 'sistema (auto v1)'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_create_initial_bp_version (initial) failed for event % (%): %', NEW.name, NEW.id, SQLERRM;
    END;
  END IF;

  IF v_should_snapshot_closing THEN
    -- Only snapshot if the current active version is not already a closing snapshot
    -- (avoids duplicates when status flips back-and-forth)
    IF NOT EXISTS (
      SELECT 1 FROM public.bp_versions
       WHERE event_id = NEW.id
         AND state = 'active'
         AND description LIKE '%Fecho automático%'
    ) THEN
      BEGIN
        v_description := 'Fecho automático — snapshot ao concluir evento (' ||
          to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
        PERFORM public.create_bp_snapshot(
          _event_id := NEW.id,
          _description := v_description,
          _approve_immediately := true,
          _created_by := NULL,
          _created_by_label := 'sistema (auto fecho)'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'auto_create_initial_bp_version (closing) failed for event % (%): %', NEW.name, NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  IF v_should_snapshot_reopen THEN
    BEGIN
      v_description := 'Reabertura — snapshot ao reabrir evento concluído (' ||
        to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
      PERFORM public.create_bp_snapshot(
        _event_id := NEW.id,
        _description := v_description,
        _approve_immediately := true,
        _created_by := NULL,
        _created_by_label := 'sistema (auto reabertura)'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_create_initial_bp_version (reopen) failed for event % (%): %', NEW.name, NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (idempotent re-create)
DROP TRIGGER IF EXISTS trg_auto_create_initial_bp_version ON public.events;
CREATE TRIGGER trg_auto_create_initial_bp_version
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_initial_bp_version();