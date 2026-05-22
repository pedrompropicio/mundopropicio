-- OP-18 M1: Multi-lead schema (Test)

-- 1. Relax constraint: allow N permanent leads per frente
DROP INDEX IF EXISTS public.uq_op_team_permanent_lead;

-- 2. Adjust sync trigger: don't steal current_lead_id when 2nd+ permanent lead is added
CREATE OR REPLACE FUNCTION public.trg_operacao_frente_lead_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current uuid;
  v_handover timestamptz;
  v_current_still_lead boolean;
BEGIN
  IF NEW.is_permanent_lead = true AND NEW.role_in_frente = 'lead' THEN
    SELECT current_lead_id, lead_handover_until
      INTO v_current, v_handover
    FROM public.operacao_frentes
    WHERE id = NEW.frente_id;

    -- Don't touch during active handover
    IF v_handover IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- Set as primary if frente has no primary yet
    IF v_current IS NULL THEN
      UPDATE public.operacao_frentes
        SET current_lead_id = NEW.profile_id
        WHERE id = NEW.frente_id;
      RETURN NEW;
    END IF;

    -- If the same profile already is the primary, nothing to do
    IF v_current = NEW.profile_id THEN
      RETURN NEW;
    END IF;

    -- Check whether the current primary still has an active permanent-lead row
    SELECT EXISTS (
      SELECT 1 FROM public.operacao_frente_team t
      WHERE t.frente_id = NEW.frente_id
        AND t.profile_id = v_current
        AND t.role_in_frente = 'lead'
        AND t.is_permanent_lead = true
        AND t.active = true
    ) INTO v_current_still_lead;

    -- Only take over the pointer if current primary is no longer a valid lead
    IF NOT v_current_still_lead THEN
      UPDATE public.operacao_frentes
        SET current_lead_id = NEW.profile_id
        WHERE id = NEW.frente_id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

-- 3. New trigger on operacao_frente_team to notify co-leads
--    (the existing trg_notify_lead_assigned on operacao_frentes only fires
--     when current_lead_id changes; co-leads added via team would be silent)
CREATE OR REPLACE FUNCTION public.trg_notify_co_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_name text;
  v_event_name text;
  v_event_id uuid;
  v_frente_name text;
  v_frente_type text;
  v_current_lead uuid;
  v_was_lead boolean := false;
BEGIN
  -- Only notify if this row is an active lead
  IF NEW.role_in_frente <> 'lead' OR NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if this row just became a lead (or just became active)
  IF TG_OP = 'UPDATE' THEN
    v_was_lead := (OLD.role_in_frente = 'lead' AND OLD.active = true);
    IF v_was_lead THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT event_id, name,
         CASE type WHEN 'zone' THEN 'Zona' WHEN 'service' THEN 'Serviço' ELSE 'Frente' END,
         current_lead_id
    INTO v_event_id, v_frente_name, v_frente_type, v_current_lead
  FROM public.operacao_frentes WHERE id = NEW.frente_id;

  -- Avoid duplicate: if this profile is/will be the primary, trg_notify_lead_assigned
  -- on operacao_frentes will already enqueue the notification.
  IF v_current_lead = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = NEW.profile_id;
  SELECT name INTO v_event_name FROM public.events WHERE id = v_event_id;

  PERFORM public.enqueue_whatsapp_notification(
    'lead_atribuido_zona_servico',
    NEW.profile_id,
    jsonb_build_array(
      COALESCE(v_user_name,''), v_frente_type,
      COALESCE(v_frente_name,''), COALESCE(v_event_name,'')
    ),
    v_event_id, 'frente', NEW.frente_id
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS notify_co_lead_assigned ON public.operacao_frente_team;
CREATE TRIGGER notify_co_lead_assigned
AFTER INSERT OR UPDATE ON public.operacao_frente_team
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_co_lead_assigned();