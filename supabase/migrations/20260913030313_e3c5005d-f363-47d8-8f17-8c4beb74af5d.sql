ALTER TABLE public.event_settlements
  ADD COLUMN returns_parent_deductible_vat boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_settlements
  ADD CONSTRAINT event_settlements_root_no_vat_return
  CHECK (NOT returns_parent_deductible_vat OR parent_id IS NOT NULL);

CREATE UNIQUE INDEX event_settlements_one_vat_return_per_parent
  ON public.event_settlements (parent_id)
  WHERE returns_parent_deductible_vat;

CREATE OR REPLACE FUNCTION public.validate_settlement_participant()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_event uuid; v_sealed boolean;
BEGIN
  SELECT event_id, is_sealed INTO v_event, v_sealed
    FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', NEW.settlement_id; END IF;
  IF COALESCE(v_sealed, false) AND COALESCE(current_setting('app.settlement_seal_op', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: os participantes não podem ser alterados. Reabra primeiro.';
  END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'O participante tem de pertencer ao mesmo evento do fechamento'; END IF;
  IF NEW.mode = 'settles' AND NEW.participant_kind = 'partner' THEN
    IF EXISTS (
      SELECT 1 FROM public.event_settlement_participants p
      WHERE p.event_id = NEW.event_id AND p.supplier_id = NEW.supplier_id
        AND p.mode = 'settles' AND p.id <> COALESCE(NEW.id, gen_random_uuid())
    ) THEN
      RAISE EXCEPTION 'Este sócio já é pago por outro fechamento deste evento (só pode haver um "settles")';
    END IF;
  END IF;
  RETURN NEW;
END $function$;