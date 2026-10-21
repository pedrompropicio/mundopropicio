-- LOCAL ONLY: definition retrieved from Live catalog SELECT, no financial rows.
CREATE OR REPLACE FUNCTION public.transaction_offset_create(p_receivable uuid, p_payable uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_pay uuid;
BEGIN
  INSERT INTO public.transaction_offsets (receivable_transaction_id, payable_transaction_id, amount, note)
  VALUES (p_receivable, p_payable, round(p_amount, 2), NULLIF(trim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;

  SELECT x.id INTO v_pay
    FROM public.transaction_payments x
   WHERE x.transaction_id IN (p_receivable, p_payable)
     AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL
   ORDER BY x.payment_date DESC, x.created_at DESC
   LIMIT 1;
  IF v_pay IS NOT NULL THEN
    PERFORM public._apply_transaction_offset(v_id, v_pay);
  END IF;
  RETURN v_id;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.transaction_offset_create(uuid,uuid,numeric,text) TO authenticated,service_role;
