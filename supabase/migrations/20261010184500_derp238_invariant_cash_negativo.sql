-- D-ERP238 (#305): invariante conta_cash_saldo_negativo.
-- Saldo usado: public._account_true_balance_asof_raw(id, NULL) — é o mesmo saldo que o
-- Dashboard mostra (account_true_balances_asof). Um invariante que vigiasse um número
-- diferente do mostrado no ecrã não serviria de nada. Essa função não filtra status,
-- reversed_at nem is_hidden; é conhecido e fica como está nesta decisão.
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('conta_cash_saldo_negativo',
        'Conta de tipo cash (numerário) com saldo negativo',
        'error', 'empresa', 0,
        'D-ERP238 (#305): numerário negativo é fisicamente impossível — falta uma entrada, sobra uma saída ou o saldo de abertura está mal implantado. Caso de origem: a Conta Caixa mostrava −6.120,00 por ter initial_balance_date = 2026-08-31 com initial_balance = 0,00 quando havia 6.120,00 reais na gaveta; corrigido a 10/10/2026, saldo agora 0,00. Saldo = _account_true_balance_asof_raw(id, NULL), o mesmo do Dashboard.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_cash()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH b AS (
    SELECT a.id, a.name AS conta, a.company_id,
           public._account_true_balance_asof_raw(a.id, NULL) AS saldo
      FROM public.financial_accounts a
     WHERE a.type = 'cash'
  ), bad AS (
    SELECT * FROM b WHERE saldo < -0.005
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'conta', x.conta, 'company_id', x.company_id, 'saldo', round(x.saldo, 2)) ORDER BY x.saldo) FROM (SELECT * FROM bad LIMIT 10) x), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'conta_cash_saldo_negativo';
END $function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_cash() FROM PUBLIC, anon, authenticated;

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
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
  UNION ALL SELECT * FROM public._run_invariant_checks_rateio()
  UNION ALL SELECT * FROM public._run_invariant_checks_cash()
$function$;