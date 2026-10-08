-- reference_count é NOT NULL: fica 0 como "por aceitar" até o Pedro indicar a referência (accept_invariant_reference).
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('transacao_duplica_fatura',
 'Transações mãe vivas com a mesma fatura (empresa + fornecedor + invoice_ref normalizada) e o mesmo valor (±0,01) e tipo',
 'warn', 'empresa', 0,
 '#284 (08/10/2026). Conta transações distintas, não pares. Exclui pares de tipo diferente (transferência entre contas). Heurístico: faturas repartidas em linhas iguais e tranches iguais são legítimas — por isso warn. Referência 0 provisória, por aceitar pelo Pedro.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_duplicate_invoices()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #284: conta TRANSAÇÕES DISTINTAS (não pares) com par de mesma fatura, valor e tipo.
  -- Pares de type diferente ficam fora: transferência entre contas nasce sempre assim.
  WITH base AS (
    SELECT t.id, t.company_id, t.supplier_id, t.type, t.amount, t.date, t.description,
           upper(regexp_replace(btrim(t.invoice_ref), '\s+', ' ', 'g')) AS ref_norm
      FROM public.transactions t
     WHERE t.parent_transaction_id IS NULL AND t.reversed_at IS NULL
       AND t.supplier_id IS NOT NULL
       AND nullif(btrim(t.invoice_ref), '') IS NOT NULL
  ), bad AS (
    SELECT DISTINCT a.id, a.company_id, a.supplier_id, a.ref_norm, a.type, a.amount, a.date, a.description
      FROM base a JOIN base b
        ON b.id <> a.id AND b.company_id = a.company_id AND b.supplier_id = a.supplier_id
       AND b.ref_norm = a.ref_norm AND b.type IS NOT DISTINCT FROM a.type
       AND abs(b.amount - a.amount) <= 0.01
  )
  SELECT count(DISTINCT id),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY date DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, cZ, i.reference_count,
         (cZ = i.reference_count) AS conforme, i.notes, sZ
    FROM public.system_invariants i WHERE i.name = 'transacao_duplica_fatura';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
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
$function$;