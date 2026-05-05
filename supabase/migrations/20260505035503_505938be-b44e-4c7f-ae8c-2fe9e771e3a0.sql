DO $$
DECLARE
  v_run RECORD;
  v_fc_ids uuid[];
  v_tx_ids uuid[];
  v_sup_ids uuid[];
  v_safe_sup uuid[];
BEGIN
  SELECT * INTO v_run FROM coala_import_runs WHERE id = 'eb8e0353-671f-4b5f-8f8d-a6830610bdba';
  v_fc_ids := COALESCE(v_run.created_forecast_ids, ARRAY[]::uuid[]);
  v_tx_ids := COALESCE(v_run.created_transaction_ids, ARRAY[]::uuid[]);
  v_sup_ids := COALESCE(v_run.created_supplier_ids, ARRAY[]::uuid[]);

  UPDATE event_forecasts SET transaction_id = NULL WHERE transaction_id = ANY(v_tx_ids);
  DELETE FROM event_forecasts WHERE id = ANY(v_fc_ids);
  DELETE FROM transactions WHERE id = ANY(v_tx_ids);

  SELECT ARRAY_AGG(s.id) INTO v_safe_sup
  FROM suppliers s
  WHERE s.id = ANY(v_sup_ids)
    AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.supplier_id = s.id);

  IF v_safe_sup IS NOT NULL THEN
    DELETE FROM suppliers WHERE id = ANY(v_safe_sup);
  END IF;

  UPDATE coala_import_runs
     SET status = 'reverted',
         pendencies_report = COALESCE(pendencies_report, '{}'::jsonb)
           || jsonb_build_object('reverted_at', now()::text,
                                 'reverted_suppliers', COALESCE(array_length(v_safe_sup,1),0))
   WHERE id = v_run.id;

  RAISE NOTICE 'Revertido: % BP, % TX, % suppliers', array_length(v_fc_ids,1), array_length(v_tx_ids,1), COALESCE(array_length(v_safe_sup,1),0);
END $$;