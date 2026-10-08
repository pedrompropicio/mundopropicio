-- Regra única de liquidação (D-ERP86/D-ERP157): a retenção e o crédito só entram
-- no saldo se o pagamento estiver status='paid' e reversed_at IS NULL (a mesma
-- regra de _derive_paid_amount). Patch sobre a definição viva das duas funções.
DO $mig$
DECLARE
  fn text;
  v_def text;
  v_old text := 'WHERE p.account_id = acc.id';
  v_new text := 'WHERE p.account_id = acc.id AND p.status = ''paid'' AND p.reversed_at IS NULL';
BEGIN
  FOREACH fn IN ARRAY ARRAY['public._account_true_balance_raw(uuid)', 'public._account_true_balance_asof_raw(uuid,date)'] LOOP
    v_def := pg_get_functiondef(fn::regprocedure);
    IF position('p.reversed_at IS NULL' in v_def) > 0 THEN CONTINUE; END IF;
    IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'definição inesperada em %', fn; END IF;
    EXECUTE replace(v_def, v_old, v_new);
  END LOOP;
END
$mig$;