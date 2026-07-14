
CREATE OR REPLACE FUNCTION public.get_partner_bp_realized(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parent uuid;
  v_has_access boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(v_uid, 'view_partner_realized') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT parent_event_id INTO v_parent FROM public.events WHERE id = p_event_id;

  SELECT EXISTS (
    SELECT 1 FROM public.partner_event_access pea
    WHERE pea.user_id = v_uid
      AND pea.is_active = true
      AND (pea.event_id = p_event_id OR (v_parent IS NOT NULL AND pea.event_id = v_parent))
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Event access denied' USING ERRCODE = '42501';
  END IF;

  -- Realizado por rubrica L3, seguindo a mesma definição do Relatório BP staff
  -- em modo comparação: UNION entre transações vinculadas diretamente ao forecast
  -- (event_forecasts.transaction_id) e transações que casam por category_id do
  -- forecast no mesmo evento (parcelas BP — memoria core bp-installments).
  WITH ef AS (
    SELECT DISTINCT ON (id) id, event_id, category_id, transaction_id
    FROM public.event_forecasts
    WHERE event_id = p_event_id
      AND type = 'expense'
      AND version_id IS NULL
      AND status IN ('approved','draft')
      AND category_id IS NOT NULL
  ),
  linked_direct AS (
    SELECT t.id AS tx_id, t.category_id, t.amount, t.iva_rate
    FROM ef
    JOIN public.transactions t ON t.id = ef.transaction_id
    WHERE t.type = 'expense'
      AND COALESCE(t.is_hidden, false) = false
      AND COALESCE(t.is_reversal, false) = false
  ),
  linked_by_category AS (
    SELECT DISTINCT t.id AS tx_id, t.category_id, t.amount, t.iva_rate
    FROM public.transactions t
    WHERE t.event_id = p_event_id
      AND t.type = 'expense'
      AND COALESCE(t.is_hidden, false) = false
      AND COALESCE(t.is_reversal, false) = false
      AND t.category_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM ef WHERE ef.category_id = t.category_id)
  ),
  merged AS (
    SELECT * FROM linked_direct
    UNION
    SELECT * FROM linked_by_category
  ),
  by_cat AS (
    SELECT category_id,
           SUM(amount)::numeric AS base,
           SUM(amount * COALESCE(iva_rate,0) / 100.0)::numeric AS iva
    FROM merged
    GROUP BY category_id
  ),
  resolved AS (
    -- Resolve L3 = category do lançamento (regra do produto: só L3 é selecionável)
    SELECT
      bc.category_id AS l3_id,
      c3.code AS l3_code,
      c3.name AS l3_name,
      c2.code AS l2_code,
      c2.name AS l2_name,
      c1.code AS l1_code,
      c1.name AS l1_name,
      SUM(bc.base)::numeric AS real_base,
      SUM(bc.iva)::numeric AS real_iva
    FROM by_cat bc
    LEFT JOIN public.account_categories c3 ON c3.id = bc.category_id
    LEFT JOIN public.account_categories c2 ON c2.id = c3.parent_id
    LEFT JOIN public.account_categories c1 ON c1.id = c2.parent_id
    GROUP BY bc.category_id, c3.code, c3.name, c2.code, c2.name, c1.code, c1.name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'l3_category_id', l3_id,
    'l3_code', l3_code,
    'l3_name', l3_name,
    'l2_code', l2_code,
    'l2_name', l2_name,
    'l1_code', l1_code,
    'l1_name', l1_name,
    'real_base', ROUND(real_base, 2),
    'real_iva', ROUND(real_iva, 2),
    'real_total', ROUND(real_base + real_iva, 2)
  )), '[]'::jsonb) INTO v_result
  FROM resolved;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_bp_realized(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_bp_realized(uuid) TO authenticated;
