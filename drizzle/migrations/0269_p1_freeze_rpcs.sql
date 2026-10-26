-- P1 passo 2 (0269): congelar/descongelar um sócio que acerta. Guarda (trigger) só no passo 3.
CREATE OR REPLACE FUNCTION public.freeze_settlement_participant(_participant_id uuid, _values jsonb, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_p public.event_settlement_participants; v_sealed boolean;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
          OR has_permission(auth.uid(),'manage_bp')) THEN
    RAISE EXCEPTION 'Sem permissão para congelar sócios';
  END IF;
  SELECT * INTO v_p FROM public.event_settlement_participants WHERE id = _participant_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Sócio % não existe', _participant_id; END IF;
  IF v_p.company_id IS DISTINCT FROM current_company_id() THEN RAISE EXCEPTION 'Sócio de outra empresa'; END IF;
  IF v_p.mode IS DISTINCT FROM 'settles' THEN RAISE EXCEPTION 'Só se congela um sócio que acerta'; END IF;
  SELECT is_sealed INTO v_sealed FROM public.event_settlements WHERE id = v_p.settlement_id;
  IF COALESCE(v_sealed,false) THEN RAISE EXCEPTION 'Fechamento selado: reabra primeiro'; END IF;
  IF v_p.frozen_at IS NOT NULL THEN RAISE EXCEPTION 'Este sócio já está congelado'; END IF;
  IF _values IS NULL OR jsonb_typeof(_values) <> 'object' THEN
    RAISE EXCEPTION 'Valores congelados inválidos: tem de ser um objeto';
  END IF;

  PERFORM set_config('app.settlement_freeze_op', 'on', true);
  UPDATE public.event_settlement_participants SET
    frozen_at = now(), frozen_by = auth.uid(), frozen_values = _values, freeze_note = NULLIF(btrim(_note),'')
  WHERE id = _participant_id;
  PERFORM set_config('app.settlement_freeze_op', 'off', true);

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, company_id)
  VALUES ('event_settlement_participants', _participant_id::text, 'settlement_participant_frozen',
          COALESCE(auth.uid()::text,'system'),
          jsonb_build_object('settlement_id', v_p.settlement_id, 'values', _values, 'note', NULLIF(btrim(_note),'')),
          v_p.company_id);
  RETURN jsonb_build_object('ok', true, 'participant_id', _participant_id);
END $function$;

CREATE OR REPLACE FUNCTION public.unfreeze_settlement_participant(_participant_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_p public.event_settlement_participants; v_sealed boolean;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
          OR has_permission(auth.uid(),'manage_bp')) THEN
    RAISE EXCEPTION 'Sem permissão para descongelar sócios';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'Motivo obrigatório para descongelar'; END IF;
  SELECT * INTO v_p FROM public.event_settlement_participants WHERE id = _participant_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Sócio % não existe', _participant_id; END IF;
  IF v_p.company_id IS DISTINCT FROM current_company_id() THEN RAISE EXCEPTION 'Sócio de outra empresa'; END IF;
  IF v_p.mode IS DISTINCT FROM 'settles' THEN RAISE EXCEPTION 'Só se descongela um sócio que acerta'; END IF;
  SELECT is_sealed INTO v_sealed FROM public.event_settlements WHERE id = v_p.settlement_id;
  IF COALESCE(v_sealed,false) THEN RAISE EXCEPTION 'Fechamento selado: reabra primeiro'; END IF;
  IF v_p.frozen_at IS NULL THEN RAISE EXCEPTION 'Este sócio não está congelado'; END IF;

  PERFORM set_config('app.settlement_freeze_op', 'on', true);
  UPDATE public.event_settlement_participants SET
    frozen_at = NULL, frozen_by = NULL, frozen_values = NULL, freeze_note = NULL
  WHERE id = _participant_id;
  PERFORM set_config('app.settlement_freeze_op', 'off', true);

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, company_id)
  VALUES ('event_settlement_participants', _participant_id::text, 'settlement_participant_unfrozen',
          COALESCE(auth.uid()::text,'system'),
          jsonb_build_object('frozen_at', v_p.frozen_at, 'frozen_by', v_p.frozen_by, 'values', v_p.frozen_values, 'note', v_p.freeze_note),
          jsonb_build_object('settlement_id', v_p.settlement_id, 'reason', btrim(_reason)),
          v_p.company_id);
  RETURN jsonb_build_object('ok', true, 'participant_id', _participant_id);
END $function$;

REVOKE ALL ON FUNCTION public.freeze_settlement_participant(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfreeze_settlement_participant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.freeze_settlement_participant(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unfreeze_settlement_participant(uuid, text) TO authenticated, service_role;
