-- P1 passo 3 (0270): guarda do congelamento por sócio (participantes + extras do sócio).
CREATE OR REPLACE FUNCTION public.guard_frozen_settlement_participant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_op boolean;
BEGIN
  v_op := COALESCE(current_setting('app.settlement_freeze_op', true), '') = 'on';

  IF TG_OP = 'DELETE' THEN
    IF OLD.frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'Sócio congelado: não pode ser removido. Descongele primeiro.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_op AND (
       NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
    OR NEW.frozen_by IS DISTINCT FROM OLD.frozen_by
    OR NEW.frozen_values IS DISTINCT FROM OLD.frozen_values
    OR NEW.freeze_note IS DISTINCT FROM OLD.freeze_note
  ) THEN
    RAISE EXCEPTION 'O congelamento só se altera por congelar/descongelar';
  END IF;

  IF OLD.frozen_at IS NOT NULL AND (
       NEW.profit_pct IS DISTINCT FROM OLD.profit_pct
    OR NEW.loss_pct IS DISTINCT FROM OLD.loss_pct
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.expense_includes_iva IS DISTINCT FROM OLD.expense_includes_iva
    OR NEW.can_pay IS DISTINCT FROM OLD.can_pay
    OR NEW.can_order IS DISTINCT FROM OLD.can_order
    OR NEW.transfer_with_vat IS DISTINCT FROM OLD.transfer_with_vat
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.event_partner_id IS DISTINCT FROM OLD.event_partner_id
    OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id
  ) THEN
    RAISE EXCEPTION 'Sócio congelado: a negociação não pode ser alterada. Descongele primeiro.';
  END IF;

  RETURN NEW;
END $function$;

CREATE TRIGGER trg_guard_frozen_settlement_participant
  BEFORE UPDATE OR DELETE ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_settlement_participant();

CREATE OR REPLACE FUNCTION public.guard_frozen_partner_extras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (
    SELECT 1 FROM public.event_settlement_participants p
    WHERE p.event_id = OLD.event_id AND p.event_partner_id = OLD.partner_id AND p.frozen_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Sócio congelado: os ajustes deste sócio não podem ser alterados. Descongele primeiro.';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (
    SELECT 1 FROM public.event_settlement_participants p
    WHERE p.event_id = NEW.event_id AND p.event_partner_id = NEW.partner_id AND p.frozen_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Sócio congelado: os ajustes deste sócio não podem ser alterados. Descongele primeiro.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_guard_frozen_partner_extras
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_partner_extras
  FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_partner_extras();
