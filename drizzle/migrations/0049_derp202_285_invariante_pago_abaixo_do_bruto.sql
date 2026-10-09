INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('pago_abaixo_do_bruto',
 'Transações pagas (não estornadas) com paid_amount abaixo do bruto (amount × (1 + iva_rate/100.0), a 2 casas) por mais de 0,02 €. Tolerância de 2 cêntimos porque o bruto arredonda a 2 casas e o paid_amount pode ter mais casas (16 linhas com falta de exactamente 0,01 €).',
 'warn', 'empresa', 1,
 '#285 (09/10/2026). Exclui retenção de IRS declarada, crédito de fornecedor, compensação (transaction_offsets) e venda à porta retida pela sala. Referência 1: transação 2cc16b7f-d890-4cad-b3e7-d07233d172f5, "Portagens - Carrinha alugada apoio camarim" da AQUILEIA INVEST LDA, 2,58 € de falta, Coala Festival Portugal 2026 — evento completed, fecho de 3 participantes e encerramento definitivo, sem documento. Decisão do Pedro: não se abre um evento encerrado por 2,58 € sem documento.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_below_gross()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #285: /100.0 obrigatório (iva_rate é integer). Tolerância 0,02 obrigatória (arredondamento do bruto).
  WITH bad AS (
    SELECT t.id, t.company_id, t.description, t.date, t.amount, t.iva_rate, t.paid_amount,
           round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) AS falta
      FROM public.transactions t
     WHERE t.status = 'paid' AND t.reversed_at IS NULL
       AND round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) > 0.02
       AND COALESCE(t.declared_withholding_amount,0) = 0
       AND NOT EXISTS (SELECT 1 FROM public.supplier_credit_usages u WHERE u.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_offsets o
                        WHERE t.id IN (o.receivable_transaction_id, o.payable_transaction_id))
       AND NOT EXISTS (SELECT 1 FROM public.ticket_office_settlements s
                        WHERE s.venue_retained_invoice_id = t.id AND s.reversed_at IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY falta DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, cZ, i.reference_count,
         (cZ = i.reference_count) AS conforme, i.notes, sZ
    FROM public.system_invariants i WHERE i.name = 'pago_abaixo_do_bruto';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() TO service_role;

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
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
$function$;