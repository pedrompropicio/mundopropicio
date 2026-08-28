CREATE OR REPLACE FUNCTION public.list_orphan_transactions_for_event(_event_id uuid)
 RETURNS TABLE(transaction_id uuid, tx_description text, tx_amount numeric, tx_date date, tx_category_id uuid, tx_category_name text, tx_status text, best_forecast_id uuid, best_forecast_description text, best_forecast_amount numeric, match_score integer, match_reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_forecasts AS (
    SELECT f.id, f.description, f.amount, f.category_id, f.type, f.transaction_id, f.event_id
    FROM public.event_forecasts f
    WHERE f.event_id = _event_id
  ),
  candidate_tx AS (
    SELECT t.id, t.description, t.amount, t.date, t.category_id, t.status, t.forecast_id, t.type
    FROM public.transactions t
    WHERE t.event_id = _event_id
      AND t.is_hidden IS NOT TRUE
      AND (
        t.forecast_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM active_forecasts af WHERE af.id = t.forecast_id)
      )
  ),
  scored AS (
    SELECT
      t.id            AS transaction_id,
      t.description   AS tx_description,
      t.amount        AS tx_amount,
      t.date          AS tx_date,
      t.category_id   AS tx_category_id,
      t.status        AS tx_status,
      f.id            AS best_forecast_id,
      f.description   AS best_forecast_description,
      f.amount        AS best_forecast_amount,
      (
        CASE WHEN f.category_id = t.category_id THEN 50 ELSE 0 END
      + CASE WHEN f.type = t.type THEN 10 ELSE 0 END
      + CASE
          WHEN f.amount > 0 AND t.amount > 0 THEN
            GREATEST(0, 30 - LEAST(30, (ABS(f.amount - t.amount) / NULLIF(GREATEST(f.amount, t.amount), 0) * 100)::int))
          ELSE 0
        END
      + CASE
          WHEN f.description IS NOT NULL AND t.description IS NOT NULL
            AND lower(f.description) = lower(t.description) THEN 20
          WHEN f.description IS NOT NULL AND t.description IS NOT NULL
            AND (lower(f.description) LIKE '%' || lower(t.description) || '%'
              OR lower(t.description) LIKE '%' || lower(f.description) || '%') THEN 10
          ELSE 0
        END
      ) AS match_score,
      ROW_NUMBER() OVER (
        PARTITION BY t.id
        ORDER BY
          (CASE WHEN f.category_id = t.category_id THEN 50 ELSE 0 END
         + CASE WHEN f.type = t.type THEN 10 ELSE 0 END) DESC,
          ABS(COALESCE(f.amount, 0) - COALESCE(t.amount, 0)) ASC
      ) AS rn
    FROM candidate_tx t
    LEFT JOIN active_forecasts f
      ON (f.category_id = t.category_id OR f.category_id IS NULL)
     AND f.transaction_id IS NULL
  )
  SELECT
    s.transaction_id,
    s.tx_description,
    s.tx_amount,
    s.tx_date,
    s.tx_category_id,
    cat.name AS tx_category_name,
    s.tx_status,
    s.best_forecast_id,
    s.best_forecast_description,
    s.best_forecast_amount,
    COALESCE(s.match_score, 0) AS match_score,
    CASE
      WHEN s.best_forecast_id IS NULL THEN 'no_candidate'
      WHEN s.match_score >= 80 THEN 'strong_match'
      WHEN s.match_score >= 50 THEN 'category_match'
      WHEN s.match_score > 0 THEN 'weak_match'
      ELSE 'no_match'
    END AS match_reason
  FROM scored s
  LEFT JOIN public.account_categories cat ON cat.id = s.tx_category_id
  WHERE s.rn = 1
  ORDER BY s.match_score DESC NULLS LAST, s.tx_date DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_orphan_transactions_for_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_transactions_for_event(uuid) TO service_role;