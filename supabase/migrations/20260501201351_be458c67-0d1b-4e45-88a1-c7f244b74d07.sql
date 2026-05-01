DO $$
DECLARE
  v_event_ids uuid[];
  v_cat_ids uuid[];
  v_tx_ids uuid[];
  v_fc_ids uuid[];
  n_pay int; n_doc int; n_tx int; n_bp int; n_link int;
BEGIN
  SELECT array_agg(id) INTO v_event_ids FROM events WHERE name ILIKE '%Coala%Portugal%2026%';
  SELECT array_agg(id) INTO v_cat_ids FROM account_categories WHERE code IN ('1.2.01','1.2.02');

  SELECT array_agg(id) INTO v_tx_ids FROM transactions
   WHERE event_id = ANY(v_event_ids) AND category_id = ANY(v_cat_ids);

  SELECT array_agg(id) INTO v_fc_ids FROM event_forecasts
   WHERE event_id = ANY(v_event_ids) AND category_id = ANY(v_cat_ids);

  RAISE NOTICE 'events=%, cats=%, tx=%, fc=%',
    array_length(v_event_ids,1), array_length(v_cat_ids,1),
    COALESCE(array_length(v_tx_ids,1),0), COALESCE(array_length(v_fc_ids,1),0);

  UPDATE sponsorship_pipeline
     SET linked_transaction_id = NULL, linked_forecast_id = NULL
   WHERE linked_transaction_id = ANY(COALESCE(v_tx_ids, ARRAY[]::uuid[]))
      OR linked_forecast_id    = ANY(COALESCE(v_fc_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n_link = ROW_COUNT;

  DELETE FROM transaction_payments WHERE transaction_id = ANY(COALESCE(v_tx_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n_pay = ROW_COUNT;

  DELETE FROM transaction_documents WHERE transaction_id = ANY(COALESCE(v_tx_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n_doc = ROW_COUNT;

  DELETE FROM transactions WHERE id = ANY(COALESCE(v_tx_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n_tx = ROW_COUNT;

  DELETE FROM event_forecasts WHERE id = ANY(COALESCE(v_fc_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n_bp = ROW_COUNT;

  RAISE NOTICE 'unlinked=%, payments=%, docs=%, tx=%, bp=%', n_link, n_pay, n_doc, n_tx, n_bp;
END $$;