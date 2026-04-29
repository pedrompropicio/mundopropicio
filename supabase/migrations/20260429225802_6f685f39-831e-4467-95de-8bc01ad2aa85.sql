-- Função one-shot SECURITY DEFINER que faz a cópia ignorando RLS
CREATE OR REPLACE FUNCTION public._seed_coala_from_mp()
RETURNS TABLE(categories_inserted int, suppliers_inserted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp uuid    := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  v_coala uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  v_cats int;
  v_sups int;
BEGIN
  -- 1) Plano de contas com mapa antigo->novo (preserva parent_id)
  WITH id_map AS (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM public.account_categories
    WHERE company_id = v_mp
  ),
  src AS (
    SELECT ac.*, m.new_id
    FROM public.account_categories ac
    JOIN id_map m ON m.old_id = ac.id
    WHERE ac.company_id = v_mp
  ),
  ins AS (
    INSERT INTO public.account_categories
      (id, code, name, type, parent_id, is_active, event_required, company_id, created_at, updated_at)
    SELECT s.new_id, s.code, s.name, s.type, pm.new_id,
           s.is_active, s.event_required, v_coala, now(), now()
    FROM src s
    LEFT JOIN id_map pm ON pm.old_id = s.parent_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_cats FROM ins;

  -- 2) Fornecedores
  WITH ins AS (
    INSERT INTO public.suppliers
      (id, name, trade_name, nif, contact_name, email, phone, address,
       iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3,
       payment_terms, category, notes, is_active, is_partner,
       company_id, created_at, updated_at)
    SELECT gen_random_uuid(),
           name, trade_name, nif, contact_name, email, phone, address,
           iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3,
           payment_terms, category, notes, is_active, is_partner,
           v_coala, now(), now()
    FROM public.suppliers
    WHERE company_id = v_mp
    RETURNING 1
  )
  SELECT count(*)::int INTO v_sups FROM ins;

  RETURN QUERY SELECT v_cats, v_sups;
END;
$$;

-- Executa
SELECT * FROM public._seed_coala_from_mp();

-- Limpa a função one-shot
DROP FUNCTION public._seed_coala_from_mp();