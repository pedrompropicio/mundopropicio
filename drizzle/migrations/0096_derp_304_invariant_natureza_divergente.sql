INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'transacoes_natureza_divergente_da_rubrica',
  'Transacções que contam para resultado numa rubrica corporativa (10*) com natureza (receita/despesa) diferente da da rubrica: a DRE Empresarial não as soma em nenhuma secção e mostra-as no aviso "Fora da DRE".',
  'warn',
  'empresa',
  73,
  'Referência 73 = base em 10/10/2026 (2026: 72 receitas em 10.3 = 485.106,16 + 1 receita em 10.8 = 58,65). Correcção (pontos 1-3 do #304) é decisão do Pedro; baixar a referência quando forem tratadas.'
)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_dre_nature()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id, t.company_id, t.type AS tx_type, cat.type AS cat_type, cat.code,
           t.amount, extract(year FROM COALESCE(t.payment_date, t.date))::int AS ano
      FROM public.transactions t
      JOIN public.account_categories cat ON cat.id = t.category_id
     WHERE t.status IN ('approved', 'paid')
       AND t.reversed_at IS NULL
       AND NOT COALESCE(t.is_hidden, false)
       AND NOT COALESCE(t.is_transitory, false)
       AND NOT COALESCE(t.exclude_from_result, false)
       AND cat.code LIKE '10%'
       AND t.type <> cat.type
       AND NOT (t.type = 'income' AND cat.code = '10.6.03')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('ano', y.ano, 'company_id', y.company_id, 'tx_type', y.tx_type,
                                                       'rubrica_tipo', y.cat_type, 'n', y.n, 'valor', round(y.v, 2))
                                    ORDER BY y.ano, y.company_id, y.tx_type)
                     FROM (SELECT ano, company_id, tx_type, cat_type, count(*) n, sum(amount) v
                             FROM bad GROUP BY 1, 2, 3, 4) y), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'transacoes_natureza_divergente_da_rubrica';
END $function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_dre_nature() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() TO service_role;

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
  UNION ALL SELECT * FROM public._run_invariant_checks_dre_nature()
$function$;