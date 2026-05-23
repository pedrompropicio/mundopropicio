CREATE OR REPLACE FUNCTION public.move_operacao_etapa(p_etapa_id uuid, p_new_frente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etapa RECORD;
  v_old_frente RECORD;
  v_new_frente RECORD;
  v_uid uuid := auth.uid();
  v_can_manage boolean;
  v_registros_moved int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_etapa FROM operacao_etapas WHERE id = p_etapa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa não encontrada';
  END IF;

  -- No-op
  IF v_etapa.frente_id = p_new_frente_id THEN
    RETURN jsonb_build_object('moved', false, 'etapa_id', p_etapa_id);
  END IF;

  SELECT * INTO v_old_frente FROM operacao_frentes WHERE id = v_etapa.frente_id;
  SELECT * INTO v_new_frente FROM operacao_frentes WHERE id = p_new_frente_id;
  IF v_new_frente.id IS NULL THEN
    RAISE EXCEPTION 'Frente de destino não existe';
  END IF;

  IF v_new_frente.company_id <> v_etapa.company_id THEN
    RAISE EXCEPTION 'Frente de destino pertence a outra empresa';
  END IF;

  IF v_new_frente.event_id <> v_old_frente.event_id THEN
    RAISE EXCEPTION 'Frente de destino pertence a outro evento';
  END IF;

  IF v_new_frente.type NOT IN ('zone','service') THEN
    RAISE EXCEPTION 'Frente de destino inválida (tipo)';
  END IF;

  -- Permissão: manage_operacao_etapas OU lead da origem OU lead do destino
  v_can_manage := has_permission(v_uid, 'manage_operacao_etapas')
               OR v_old_frente.current_lead_id = v_uid
               OR v_new_frente.current_lead_id = v_uid;

  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'Sem permissão para mover esta etapa';
  END IF;

  -- Mover etapa
  UPDATE operacao_etapas
     SET frente_id = p_new_frente_id,
         zone_id = CASE WHEN v_new_frente.type = 'zone' THEN NULL ELSE zone_id END,
         updated_at = now()
   WHERE id = p_etapa_id;

  -- Mover registos (campo denormalizado NOT NULL)
  WITH upd AS (
    UPDATE operacao_registros
       SET frente_id = p_new_frente_id
     WHERE etapa_id = p_etapa_id
       AND frente_id <> p_new_frente_id
    RETURNING 1
  )
  SELECT count(*) INTO v_registros_moved FROM upd;

  RETURN jsonb_build_object(
    'moved', true,
    'etapa_id', p_etapa_id,
    'from_frente_id', v_old_frente.id,
    'to_frente_id', p_new_frente_id,
    'registros_moved', v_registros_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_operacao_etapa(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_operacao_etapa(uuid, uuid) TO authenticated;