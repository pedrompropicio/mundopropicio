-- DR-2026-06-27d (fix BUG1) — permitir seleção quando só há 1 candidato no duelo
CREATE OR REPLACE FUNCTION crm.select_duel_candidate(
  p_duel_id uuid,
  p_winner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_winner_company uuid;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'no_active_company';
  END IF;

  SELECT company_id INTO v_winner_company
  FROM crm.meta_campaign_strategies
  WHERE id = p_winner_id AND duel_id = p_duel_id;

  IF v_winner_company IS NULL THEN
    RAISE EXCEPTION 'winner_not_found_in_duel';
  END IF;

  IF v_winner_company <> v_company THEN
    RAISE EXCEPTION 'forbidden_company_mismatch';
  END IF;

  UPDATE crm.meta_campaign_strategies
  SET status = 'selected', updated_at = now()
  WHERE id = p_winner_id
    AND duel_id = p_duel_id
    AND company_id = v_company;

  -- Arquiva quaisquer irmãos (se não houver, simplesmente não afeta linhas)
  UPDATE crm.meta_campaign_strategies
  SET status = 'archived', updated_at = now()
  WHERE duel_id = p_duel_id
    AND id <> p_winner_id
    AND status = 'candidate'
    AND company_id = v_company;
END;
$$;

GRANT EXECUTE ON FUNCTION crm.select_duel_candidate(uuid, uuid) TO authenticated;