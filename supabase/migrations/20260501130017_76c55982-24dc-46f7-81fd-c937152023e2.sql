-- Reverter alteração acidental em schema reservado: deixar o estado de Test alinhado com Live
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages" ON realtime.messages;

-- Substituir CHECK constraint por trigger de validação (prática segura para Cloud)
ALTER TABLE public.event_ticket_lots
  DROP CONSTRAINT IF EXISTS event_ticket_lots_applies_to_days_check;

CREATE OR REPLACE FUNCTION public.validate_event_ticket_lot_applies_to_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.applies_to_days IS NULL OR NEW.applies_to_days < 1 OR NEW.applies_to_days > 31 THEN
    RAISE EXCEPTION 'applies_to_days must be between 1 and 31';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_event_ticket_lot_applies_to_days_trigger ON public.event_ticket_lots;
CREATE TRIGGER validate_event_ticket_lot_applies_to_days_trigger
BEFORE INSERT OR UPDATE OF applies_to_days ON public.event_ticket_lots
FOR EACH ROW
EXECUTE FUNCTION public.validate_event_ticket_lot_applies_to_days();