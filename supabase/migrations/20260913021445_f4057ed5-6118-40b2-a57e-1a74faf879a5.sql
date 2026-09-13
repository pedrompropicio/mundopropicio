CREATE OR REPLACE FUNCTION public.guard_sealed_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_parent_sealed boolean; v_seal_op boolean;
BEGIN
  v_seal_op := COALESCE(current_setting('app.settlement_seal_op', true), '') = 'on';

  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      SELECT is_sealed INTO v_parent_sealed FROM public.event_settlements WHERE id = NEW.parent_id;
      IF COALESCE(v_parent_sealed, false) THEN
        RAISE EXCEPTION 'Fechamento selado: não é possível criar fechamentos dependentes dele';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_sealed THEN
      RAISE EXCEPTION 'Fechamento selado: não é possível apagar. Reabra primeiro.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_seal_op AND (
       NEW.is_sealed IS DISTINCT FROM OLD.is_sealed
    OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at
    OR NEW.sealed_by IS DISTINCT FROM OLD.sealed_by
    OR NEW.sealed_bp_version_id IS DISTINCT FROM OLD.sealed_bp_version_id
    OR NEW.sealed_snapshot IS DISTINCT FROM OLD.sealed_snapshot
    OR NEW.seal_note IS DISTINCT FROM OLD.seal_note
    OR NEW.unsealed_at IS DISTINCT FROM OLD.unsealed_at
    OR NEW.unsealed_by IS DISTINCT FROM OLD.unsealed_by
    OR NEW.unseal_reason IS DISTINCT FROM OLD.unseal_reason
  ) THEN
    RAISE EXCEPTION 'O selo só se altera por selar/reabrir';
  END IF;

  IF OLD.is_sealed AND NOT v_seal_op AND (
       NEW.name IS DISTINCT FROM OLD.name
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.parent_share_pct IS DISTINCT FROM OLD.parent_share_pct
    OR NEW.parent_share_basis IS DISTINCT FROM OLD.parent_share_basis
  ) THEN
    RAISE EXCEPTION 'Fechamento selado: nome e quota não podem ser alterados. Reabra primeiro.';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_settlement_participant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid; v_parent uuid; v_sealed boolean;
BEGIN
  SELECT event_id, parent_id, is_sealed INTO v_event, v_parent, v_sealed
    FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', NEW.settlement_id; END IF;
  IF COALESCE(v_sealed, false) AND COALESCE(current_setting('app.settlement_seal_op', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: os participantes não podem ser alterados. Reabra primeiro.';
  END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'O participante tem de pertencer ao mesmo evento do fechamento'; END IF;
  IF NEW.participant_kind = 'house' AND v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'A casa só existe no fechamento raiz do evento'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.prevent_delete_sealed_settlement_participant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_sealed boolean;
BEGIN
  SELECT is_sealed INTO v_sealed FROM public.event_settlements WHERE id = OLD.settlement_id;
  IF COALESCE(v_sealed, false) AND COALESCE(current_setting('app.settlement_seal_op', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: os participantes não podem ser removidos. Reabra primeiro.';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.validate_operation_participation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_op_event uuid; v_st_event uuid; v_sealed boolean;
BEGIN
  SELECT event_id INTO v_op_event FROM public.event_third_party_operations WHERE id = NEW.operation_id;
  SELECT event_id, is_sealed INTO v_st_event, v_sealed FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_op_event IS NULL OR v_st_event IS NULL THEN
    RAISE EXCEPTION 'Operação ou fechamento inexistente'; END IF;
  IF v_op_event <> v_st_event OR NEW.event_id <> v_st_event THEN
    RAISE EXCEPTION 'A operação e o fechamento têm de pertencer ao mesmo evento'; END IF;
  IF COALESCE(v_sealed, false) AND COALESCE(current_setting('app.settlement_seal_op', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: a participação não pode ser alterada. Reabra primeiro.'; END IF;
  RETURN NEW;
END $$;