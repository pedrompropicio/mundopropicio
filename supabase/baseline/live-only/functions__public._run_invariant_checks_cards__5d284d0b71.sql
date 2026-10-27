-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public._run_invariant_checks_cards()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e99abede8bd4e2b82091e382fab15425868b8feffc296b8e0241d05fdbce731c", "live_properties_sha256": "47ed0606c145a58e855c5d5f9927f93327a25a7cc82584ee174bfc6e85ffa0cf", "oid": 361818, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "ad83d766d31ae587b921e87d6238de732d06e7e6048f174dd6992494f055a70e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 6f606cc72e2197bbdb91ec49ac658008e990aabbd7ab515328596f184ff7b1d1
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cards()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #274: item aprovado que parece duplicar uma transação já existente no mesmo cartão.
  -- Conta ITENS DISTINTOS, não pares: um item contra N transações parecidas é UM caso a
  -- rever, e contar pares fazia o número saltar de forma combinatória com valores
  -- repetidos (4 portagens de 1,60 € no mesmo dia → 3 pares para 1 item).
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
  SELECT count(DISTINCT item_id),
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
$function$
;

ALTER FUNCTION public._run_invariant_checks_cards() OWNER TO "postgres";
-- END OPERATION 6f606cc72e2197bbdb91ec49ac658008e990aabbd7ab515328596f184ff7b1d1
