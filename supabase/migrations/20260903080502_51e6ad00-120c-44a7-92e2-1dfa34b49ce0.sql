CREATE OR REPLACE FUNCTION public.raise_forecast_budget(
  _forecast_id uuid,
  _new_amount numeric,
  _observation text
)
RETURNS public.event_forecasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.event_forecasts;
  v_actor text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem identidade de utilizador para elevar verbas de BP.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.event_forecasts WHERE id = _forecast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de BP não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_platform_admin(v_uid)
    OR public.has_permission_in(v_uid, 'raise_budget', v_row.company_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para elevar verbas de BP nesta empresa.' USING ERRCODE = '42501';
  END IF;

  IF _observation IS NULL OR btrim(_observation) = '' THEN
    RAISE EXCEPTION 'Observação obrigatória para elevar a verba da linha de BP.' USING ERRCODE = '22023';
  END IF;

  IF _new_amount IS NULL OR _new_amount <= COALESCE(v_row.amount, 0) THEN
    RAISE EXCEPTION 'A nova verba tem de ser superior à verba actual da linha.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(p.email, v_uid::text) INTO v_actor
  FROM public.profiles p WHERE p.id = v_uid;
  v_actor := COALESCE(v_actor, v_uid::text);

  -- NUNCA toca em baseline_amount (D3): o previsto original é fixo.
  UPDATE public.event_forecasts
     SET amount = _new_amount,
         updated_at = now()
   WHERE id = _forecast_id
  RETURNING * INTO v_row;

  INSERT INTO public.forecast_audit_log (
    forecast_id, changed_by, field_name, old_value, new_value, observation, company_id
  ) VALUES (
    _forecast_id,
    v_actor,
    'Valor (EUR)',
    to_char(COALESCE((SELECT amount FROM public.event_forecasts WHERE id = _forecast_id), 0), 'FM999999999990.00'),
    to_char(_new_amount, 'FM999999999990.00'),
    btrim(_observation),
    v_row.company_id
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_forecast_budget(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_forecast_budget(uuid, numeric, text) TO authenticated, service_role;