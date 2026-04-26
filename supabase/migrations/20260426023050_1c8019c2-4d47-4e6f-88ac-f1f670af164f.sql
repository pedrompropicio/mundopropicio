-- Phase 10c — Orphan transactions detection & auto-relink (retry with full action whitelist)

CREATE OR REPLACE FUNCTION public.list_orphan_transactions_for_event(
  _event_id uuid
)
RETURNS TABLE (
  transaction_id uuid,
  tx_description text,
  tx_amount numeric,
  tx_date date,
  tx_category_id uuid,
  tx_category_name text,
  tx_status text,
  best_forecast_id uuid,
  best_forecast_description text,
  best_forecast_amount numeric,
  match_score int,
  match_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      AND t.deleted_at IS NULL
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
$$;


CREATE OR REPLACE FUNCTION public.relink_orphan_transactions(
  _event_id uuid,
  _pairs jsonb,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
)
RETURNS TABLE (
  relinked_count int,
  skipped_count int,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pair jsonb;
  v_tx_id uuid;
  v_fc_id uuid;
  v_relinked int := 0;
  v_skipped int := 0;
  v_details jsonb := '[]'::jsonb;
  v_forecast RECORD;
  v_tx RECORD;
BEGIN
  IF _pairs IS NULL OR jsonb_typeof(_pairs) <> 'array' THEN
    RAISE EXCEPTION 'Parameter _pairs must be a JSON array';
  END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(_pairs) LOOP
    v_tx_id := NULLIF(v_pair->>'transaction_id', '')::uuid;
    v_fc_id := NULLIF(v_pair->>'forecast_id', '')::uuid;

    IF v_tx_id IS NULL OR v_fc_id IS NULL THEN
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object('transaction_id', v_tx_id, 'forecast_id', v_fc_id, 'reason', 'invalid_pair');
      CONTINUE;
    END IF;

    SELECT id, event_id, transaction_id, category_id, amount INTO v_forecast
      FROM public.event_forecasts WHERE id = v_fc_id;

    IF v_forecast IS NULL OR v_forecast.event_id IS DISTINCT FROM _event_id THEN
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object('transaction_id', v_tx_id, 'forecast_id', v_fc_id, 'reason', 'forecast_not_in_event');
      CONTINUE;
    END IF;

    IF v_forecast.transaction_id IS NOT NULL AND v_forecast.transaction_id <> v_tx_id THEN
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object('transaction_id', v_tx_id, 'forecast_id', v_fc_id, 'reason', 'forecast_already_linked');
      CONTINUE;
    END IF;

    SELECT id, event_id INTO v_tx FROM public.transactions WHERE id = v_tx_id;
    IF v_tx IS NULL OR v_tx.event_id IS DISTINCT FROM _event_id THEN
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object('transaction_id', v_tx_id, 'forecast_id', v_fc_id, 'reason', 'transaction_not_in_event');
      CONTINUE;
    END IF;

    UPDATE public.event_forecasts SET transaction_id = v_tx_id, updated_at = now() WHERE id = v_fc_id;
    UPDATE public.transactions    SET forecast_id    = v_fc_id, updated_at = now() WHERE id = v_tx_id;

    v_relinked := v_relinked + 1;
    v_details := v_details || jsonb_build_object('transaction_id', v_tx_id, 'forecast_id', v_fc_id, 'reason', 'relinked');
  END LOOP;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  )
  SELECT bv.id, _event_id, 'orphans_relinked', _performed_by, _performed_by_label,
    jsonb_build_object('relinked_count', v_relinked, 'skipped_count', v_skipped, 'details', v_details)
  FROM public.bp_versions bv
  WHERE bv.event_id = _event_id AND bv.state = 'active'
  LIMIT 1;

  RETURN QUERY SELECT v_relinked, v_skipped, v_details;
END;
$$;


-- Extend audit-log action whitelist to include the new action and pre-existing values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bp_version_audit_log_action_check') THEN
    ALTER TABLE public.bp_version_audit_log DROP CONSTRAINT bp_version_audit_log_action_check;
  END IF;
END $$;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action IN (
    'created','approved','superseded','archived','unarchived',
    'discarded','frozen','retroactive_snapshot','cascaded',
    'cascaded_from_master',
    'scenario_promoted','pinned','unpinned','reverted','reconciled',
    'orphans_relinked'
  ));