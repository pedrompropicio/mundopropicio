CREATE OR REPLACE FUNCTION public._test_bp_tx_guards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  res jsonb := '{}'::jsonb;
  v_anitta uuid := 'fdfb39fe-45f2-43f5-9ec9-7cb536360ae1';
  v_fc_free uuid := 'fa7bd20e-9158-42d2-9c03-403140088799';
  v_tx_ivete uuid := '1f47d69a-af16-4320-aedd-01340d8d0053';
  v_tx_null uuid := 'a16b4416-00ee-4c76-a414-7d495862f411';
  v_ivete_ev uuid;
  v_fc_linked uuid;
  v_tx_linked uuid;
  v_old_cat uuid;
  v_new_cat uuid;
  v_after uuid;
  v_logs int;
  v_txcat uuid;
BEGIN
  SELECT event_id INTO v_ivete_ev FROM transactions WHERE id = v_tx_ivete;

  BEGIN
    UPDATE event_forecasts SET transaction_id = v_tx_ivete WHERE id = v_fc_free;
    res := res || jsonb_build_object('teste1', 'FALHOU — aceitou o vínculo cruzado');
    RAISE EXCEPTION 'ROLLBACK_T1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ROLLBACK_T1' THEN NULL;
    ELSE res := res || jsonb_build_object('teste1_recusado', true, 'teste1_msg', SQLERRM);
    END IF;
  END;

  BEGIN
    UPDATE event_forecasts SET transaction_id = v_tx_null WHERE id = v_fc_free;
    res := res || jsonb_build_object('teste2_aceito', true);
    RAISE EXCEPTION 'ROLLBACK_T2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_T2' THEN
      res := res || jsonb_build_object('teste2_aceito', false, 'teste2_msg', SQLERRM);
    END IF;
  END;

  SELECT f.id, f.transaction_id INTO v_fc_linked, v_tx_linked
    FROM event_forecasts f JOIN transactions t ON t.id = f.transaction_id
   WHERE f.event_id = v_anitta AND f.version_id IS NULL AND t.event_id = v_anitta
   LIMIT 1;
  BEGIN
    UPDATE transactions SET event_id = v_ivete_ev WHERE id = v_tx_linked;
    SELECT transaction_id INTO v_after FROM event_forecasts WHERE id = v_fc_linked;
    SELECT count(*) INTO v_logs FROM system_audit_log
     WHERE action = 'auto_unlink_forecast_tx_event_change' AND metadata->>'forecast_id' = v_fc_linked::text;
    res := res || jsonb_build_object('teste3_forecast', v_fc_linked, 'teste3_tx', v_tx_linked,
      'teste3_transaction_id_depois', v_after, 'teste3_logs', v_logs);
    RAISE EXCEPTION 'ROLLBACK_T3';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_T3' THEN res := res || jsonb_build_object('teste3_erro', SQLERRM); END IF;
  END;

  SELECT f.id, f.transaction_id, f.category_id INTO v_fc_linked, v_tx_linked, v_old_cat
    FROM event_forecasts f JOIN transactions t ON t.id = f.transaction_id
   WHERE f.event_id = v_anitta AND f.version_id IS NULL AND t.event_id = v_anitta
     AND f.category_id IS NOT NULL
   LIMIT 1;
  SELECT c.id INTO v_new_cat FROM account_categories c
   WHERE c.id <> v_old_cat
     AND c.type = (SELECT type FROM account_categories WHERE id = v_old_cat)
     AND c.company_id = (SELECT company_id FROM account_categories WHERE id = v_old_cat)
     AND c.parent_id = (SELECT parent_id FROM account_categories WHERE id = v_old_cat)
   LIMIT 1;
  BEGIN
    UPDATE event_forecasts SET category_id = v_new_cat WHERE id = v_fc_linked;
    SELECT category_id INTO v_txcat FROM transactions WHERE id = v_tx_linked;
    res := res || jsonb_build_object('teste5_forecast', v_fc_linked,
      'teste5_nova_cat', v_new_cat, 'teste5_tx_cat_depois', v_txcat,
      'teste5_propagou', (v_txcat = v_new_cat));
    RAISE EXCEPTION 'ROLLBACK_T5';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_T5' THEN res := res || jsonb_build_object('teste5_erro', SQLERRM); END IF;
  END;

  RETURN res;
END $fn$;