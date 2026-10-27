-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.card_load_on_out_paid()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b4aa5c1520d36b3e38c61082acb9314c50b9aed12eec6257b32fce787fcc7d85", "live_properties_sha256": "dbef9aef7e8267fcea93f1fbab7a4d94a331e545aa31b697f74dfaeccd7f2729", "oid": 172792, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "ebea2f2ea7ff9cdd7f2046146330b8c87d9258601689378a8cff8e561e12e42c", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 21112fc281b881119f4b2240e20fc4606c15d48b95260b8c4530ead09cd5ab6b
CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  public.card_session_loads%ROWTYPE;
  v_sess  public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_in_id UUID;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_load
  FROM public.card_session_loads
  WHERE out_transaction_id = NEW.id
    AND in_transaction_id IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = v_load.session_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = v_load.source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;
  SELECT id   INTO v_cat_id    FROM public.account_categories  WHERE code = '10.3' LIMIT 1;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date,
    status, paid_amount, payment_date,
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    NEW.company_id, 'income',
    'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
    v_load.amount, 0, v_load.load_date,
    'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
    TRUE, 'carga_cartao', TRUE, v_cat_id, v_sess.card_account_id
  ) RETURNING id INTO v_in_id;

  UPDATE public.card_session_loads
     SET in_transaction_id = v_in_id
   WHERE id = v_load.id;

  RETURN NEW;
END;
$function$
;

ALTER FUNCTION public.card_load_on_out_paid() OWNER TO "postgres";
-- END OPERATION 21112fc281b881119f4b2240e20fc4606c15d48b95260b8c4530ead09cd5ab6b
