-- ============================================================
-- Épica #146 (f) — Selo por fechamento + guardas + terminologia
-- ============================================================

-- 1) Colunas novas do selo
ALTER TABLE public.event_settlements
  ADD COLUMN IF NOT EXISTS sealed_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS seal_note text,
  ADD COLUMN IF NOT EXISTS unsealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsealed_by uuid,
  ADD COLUMN IF NOT EXISTS unseal_reason text;

COMMENT ON COLUMN public.event_settlements.sealed_snapshot IS
  'Resultado do motor congelado no momento de selar. Só escrito por seal_event_settlement/unseal_event_settlement.';

-- 2) Guarda central do fechamento selado
CREATE OR REPLACE FUNCTION public.guard_sealed_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_parent_sealed boolean; v_seal_op boolean;
BEGIN
  v_seal_op := current_setting('app.settlement_seal_op', true) = 'on';

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

  -- UPDATE: os campos do selo só mudam via seal/unseal
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

DROP TRIGGER IF EXISTS trg_guard_sealed_event_settlement ON public.event_settlements;
CREATE TRIGGER trg_guard_sealed_event_settlement
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_settlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_event_settlement();

-- 3) Participantes: bloquear em fechamento selado + terminologia
CREATE OR REPLACE FUNCTION public.validate_settlement_participant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid; v_parent uuid; v_sealed boolean;
BEGIN
  SELECT event_id, parent_id, is_sealed INTO v_event, v_parent, v_sealed
    FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', NEW.settlement_id; END IF;
  IF COALESCE(v_sealed, false) AND current_setting('app.settlement_seal_op', true) IS DISTINCT FROM 'on' THEN
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
  IF COALESCE(v_sealed, false) AND current_setting('app.settlement_seal_op', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: os participantes não podem ser removidos. Reabra primeiro.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_sealed_settlement_participant ON public.event_settlement_participants;
CREATE TRIGGER trg_prevent_delete_sealed_settlement_participant
  BEFORE DELETE ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_sealed_settlement_participant();

-- 4) Linhas do BP / transações: bloquear marcar-desmarcar em selado + terminologia
CREATE OR REPLACE FUNCTION public.validate_forecast_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid; v_sealed boolean; v_old_sealed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_settlement_id IS NOT NULL
     AND NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id THEN
    SELECT is_sealed INTO v_old_sealed FROM public.event_settlements WHERE id = OLD.event_settlement_id;
    IF COALESCE(v_old_sealed, false) THEN
      RAISE EXCEPTION 'Fechamento selado: as linhas do BP não podem ser desmarcadas. Reabra primeiro.';
    END IF;
  END IF;

  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  SELECT event_id, is_sealed INTO v_event, v_sealed FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento % não existe', NEW.event_settlement_id;
  END IF;
  IF COALESCE(v_sealed, false) AND (TG_OP = 'INSERT' OR NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id) THEN
    RAISE EXCEPTION 'Fechamento selado: não é possível marcar novas linhas do BP. Reabra primeiro.';
  END IF;
  IF NEW.event_id IS NULL OR NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A linha do BP só pode ser ligada a um fechamento do próprio evento';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_transaction_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid; v_sealed boolean; v_old_sealed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_settlement_id IS NOT NULL
     AND NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id THEN
    SELECT is_sealed INTO v_old_sealed FROM public.event_settlements WHERE id = OLD.event_settlement_id;
    IF COALESCE(v_old_sealed, false) THEN
      RAISE EXCEPTION 'Fechamento selado: as transações não podem ser desmarcadas. Reabra primeiro.';
    END IF;
  END IF;

  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'Uma transação sem evento (mãe de rateio) não pode ser ligada a um fechamento';
  END IF;
  SELECT event_id, is_sealed INTO v_event, v_sealed FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento % não existe', NEW.event_settlement_id;
  END IF;
  IF COALESCE(v_sealed, false) AND (TG_OP = 'INSERT' OR NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id) THEN
    RAISE EXCEPTION 'Fechamento selado: não é possível marcar novas transações. Reabra primeiro.';
  END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A transação só pode ser ligada a um fechamento do próprio evento';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_delete_event_settlement_with_lines()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n_f int; n_t int;
BEGIN
  SELECT count(*) INTO n_f FROM public.event_forecasts WHERE event_settlement_id = OLD.id;
  SELECT count(*) INTO n_t FROM public.transactions WHERE event_settlement_id = OLD.id;
  IF n_f + n_t > 0 THEN
    RAISE EXCEPTION 'Não é possível apagar o fechamento "%": tem % linha(s) de BP e % transação(ões) ligadas', OLD.name, n_f, n_t;
  END IF;
  RETURN OLD;
END $$;

-- 5) Participações em operações de terceiros: terminologia
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
  IF COALESCE(v_sealed, false) AND current_setting('app.settlement_seal_op', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Fechamento selado: a participação não pode ser alterada. Reabra primeiro.'; END IF;
  RETURN NEW;
END $$;

-- 6) RPC: selar
CREATE OR REPLACE FUNCTION public.seal_event_settlement(
  _settlement_id uuid,
  _snapshot jsonb,
  _bp_version_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.event_settlements; v_c1 numeric; v_c2 numeric; v_bp_event uuid; v_tol numeric := 0.005;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
          OR has_permission(auth.uid(),'manage_bp')) THEN
    RAISE EXCEPTION 'Sem permissão para selar fechamentos';
  END IF;

  SELECT * INTO v_row FROM public.event_settlements WHERE id = _settlement_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', _settlement_id; END IF;
  IF v_row.company_id <> current_company_id() THEN RAISE EXCEPTION 'Fechamento de outra empresa'; END IF;
  IF v_row.is_sealed THEN RAISE EXCEPTION 'Este fechamento já está selado'; END IF;
  IF _snapshot IS NULL THEN RAISE EXCEPTION 'Snapshot do resultado em falta'; END IF;

  v_c1 := COALESCE((_snapshot->>'check1')::numeric, 0);
  v_c2 := COALESCE((_snapshot->>'check2')::numeric, 0);
  IF abs(v_c1) > v_tol OR abs(v_c2) > v_tol THEN
    RAISE EXCEPTION 'Só é possível selar com as verificações a zero (C1=%, C2=%)', v_c1, v_c2;
  END IF;

  IF _bp_version_id IS NOT NULL THEN
    SELECT event_id INTO v_bp_event FROM public.bp_versions WHERE id = _bp_version_id;
    IF v_bp_event IS NULL OR v_bp_event <> v_row.event_id THEN
      RAISE EXCEPTION 'A versão de BP não pertence a este evento';
    END IF;
  END IF;

  PERFORM set_config('app.settlement_seal_op', 'on', true);

  UPDATE public.event_settlements SET
    is_sealed = true,
    sealed_at = now(),
    sealed_by = auth.uid(),
    sealed_bp_version_id = _bp_version_id,
    sealed_snapshot = _snapshot,
    seal_note = _note,
    unsealed_at = NULL, unsealed_by = NULL, unseal_reason = NULL
  WHERE id = _settlement_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, company_id)
  VALUES ('event_settlements', _settlement_id::text, 'settlement_sealed', COALESCE(auth.uid()::text,'system'),
          jsonb_build_object('bp_version_id', _bp_version_id, 'note', _note, 'check1', v_c1, 'check2', v_c2),
          v_row.company_id);

  RETURN jsonb_build_object('ok', true, 'settlement_id', _settlement_id, 'bp_version_id', _bp_version_id);
END $$;

REVOKE ALL ON FUNCTION public.seal_event_settlement(uuid, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seal_event_settlement(uuid, jsonb, uuid, text) TO authenticated;

-- 7) RPC: reabrir
CREATE OR REPLACE FUNCTION public.unseal_event_settlement(
  _settlement_id uuid,
  _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.event_settlements;
BEGIN
  IF NOT has_permission(auth.uid(),'manage_bp') THEN
    RAISE EXCEPTION 'Sem permissão para reabrir fechamentos';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'É obrigatório indicar o motivo da reabertura';
  END IF;

  SELECT * INTO v_row FROM public.event_settlements WHERE id = _settlement_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', _settlement_id; END IF;
  IF v_row.company_id <> current_company_id() THEN RAISE EXCEPTION 'Fechamento de outra empresa'; END IF;
  IF NOT v_row.is_sealed THEN RAISE EXCEPTION 'Este fechamento não está selado'; END IF;

  PERFORM set_config('app.settlement_seal_op', 'on', true);

  UPDATE public.event_settlements SET
    is_sealed = false,
    sealed_snapshot = NULL,
    unsealed_at = now(),
    unsealed_by = auth.uid(),
    unseal_reason = btrim(_reason)
  WHERE id = _settlement_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, company_id)
  VALUES ('event_settlements', _settlement_id::text, 'settlement_unsealed', COALESCE(auth.uid()::text,'system'),
          jsonb_build_object('sealed_at', v_row.sealed_at, 'sealed_by', v_row.sealed_by,
                             'sealed_bp_version_id', v_row.sealed_bp_version_id),
          jsonb_build_object('reason', btrim(_reason)),
          v_row.company_id);

  RETURN jsonb_build_object('ok', true, 'settlement_id', _settlement_id);
END $$;

REVOKE ALL ON FUNCTION public.unseal_event_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unseal_event_settlement(uuid, text) TO authenticated;

-- 8) RPC do Portal do Sócio: contexto da quota SEM hierarquia
CREATE OR REPLACE FUNCTION public.settlement_partner_quota_context(
  _settlement_id uuid,
  _supplier_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.event_settlements; v_p public.event_settlement_participants;
        v_event_name text; v_partner_name text; v_gross boolean; v_locals numeric;
BEGIN
  SELECT * INTO v_row FROM public.event_settlements WHERE id = _settlement_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', _settlement_id; END IF;
  IF v_row.company_id <> current_company_id() THEN RAISE EXCEPTION 'Fechamento de outra empresa'; END IF;

  SELECT * INTO v_p FROM public.event_settlement_participants
   WHERE settlement_id = _settlement_id AND supplier_id = _supplier_id LIMIT 1;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Este sócio não participa neste fechamento'; END IF;

  SELECT name INTO v_event_name FROM public.events WHERE id = v_row.event_id;
  SELECT name INTO v_partner_name FROM public.suppliers WHERE id = _supplier_id;

  SELECT COALESCE(v_p.expense_includes_iva, e.partner_calc_basis = 'gross')
    INTO v_gross FROM public.events e WHERE e.id = v_row.event_id;

  v_locals := v_row.parent_share_pct; -- percentagem contratada do resultado do evento

  RETURN jsonb_build_object(
    'event_name', v_event_name,
    'partner_name', v_partner_name,
    'gross_expenses', COALESCE(v_gross, false),
    'share_pct', v_locals,
    'share_basis', v_row.parent_share_basis,
    'partner_pct', v_p.profit_pct,
    'partner_loss_pct', v_p.loss_pct,
    'is_sealed', v_row.is_sealed,
    'sealed_at', v_row.sealed_at,
    'sealed_snapshot', CASE WHEN v_row.is_sealed THEN v_row.sealed_snapshot ELSE NULL END
  );
END $$;

REVOKE ALL ON FUNCTION public.settlement_partner_quota_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_partner_quota_context(uuid, uuid) TO authenticated;