-- #274: invariante item_de_cartao_duplica_transacao (mesma regra do ApproveCardItemModal e de possible_duplicates no close-card-session).
-- A linha em public.system_invariants é inserida pelo Pedro em Live; sem ela a função não devolve nada.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cards()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT i.id AS item_id, i.session_id, s.company_id, s.card_account_id,
           i.item_date, round(i.amount * (1 + COALESCE(i.iva_rate, 0) / 100.0), 2) AS item_gross,
           i.description AS item_description,
           t.id AS transaction_id, t.paid_amount AS transaction_gross,
           t.description AS transaction_description
      FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      JOIN public.transactions t
        ON t.account_id = s.card_account_id
       AND COALESCE(t.payment_date, t.date) = i.item_date
       AND abs(COALESCE(t.paid_amount, 0) - i.amount * (1 + COALESCE(i.iva_rate, 0) / 100.0)) < 0.01
       AND t.reversed_at IS NULL
       AND COALESCE(t.is_hidden, false) = false
     WHERE i.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM public.card_session_items x WHERE x.transaction_id = t.id)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY item_date DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, i.reference_count, (cZ = i.reference_count) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'item_de_cartao_duplica_transacao';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cards() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
$function$;