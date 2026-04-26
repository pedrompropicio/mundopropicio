-- ============================================================
-- Phase 4: Auto-create v1 when event becomes confirmed/active
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_initial_bp_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_create boolean := false;
BEGIN
  -- Only act on master/standalone (splits inherit via cascade)
  IF NEW.parent_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only when transitioning into a "live" state
  IF NEW.status NOT IN ('confirmed', 'active') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_create := true;
  ELSIF TG_OP = 'UPDATE'
    AND (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'active'))
    AND NEW.status IN ('confirmed', 'active') THEN
    v_should_create := true;
  END IF;

  IF NOT v_should_create THEN
    RETURN NEW;
  END IF;

  -- Skip if any version already exists for this event
  IF EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id) THEN
    RETURN NEW;
  END IF;

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
    RAISE WARNING 'auto_create_initial_bp_version failed for event % (%): %', NEW.name, NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_initial_bp_version ON public.events;
CREATE TRIGGER trg_auto_create_initial_bp_version
  AFTER INSERT OR UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_initial_bp_version();

COMMENT ON FUNCTION public.auto_create_initial_bp_version IS
  'Phase 4: auto-creates v1 active BP version when a master/standalone event enters confirmed/active state for the first time. No-op if any version already exists.';