CREATE TABLE IF NOT EXISTS public.system_invariants (
  name text PRIMARY KEY,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warn')),
  reference_count bigint NOT NULL DEFAULT 0,
  notes text,
  reference_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_invariants TO authenticated;
GRANT ALL ON public.system_invariants TO service_role;
ALTER TABLE public.system_invariants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_invariants_select_admins" ON public.system_invariants;
CREATE POLICY "system_invariants_select_admins" ON public.system_invariants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin'));

CREATE TABLE IF NOT EXISTS public.invariant_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  ran_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  drift_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invariant_runs_ran_at_idx ON public.invariant_runs (ran_at DESC);

GRANT SELECT ON public.invariant_runs TO authenticated;
GRANT ALL ON public.invariant_runs TO service_role;
ALTER TABLE public.invariant_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invariant_runs_select_admins" ON public.invariant_runs;
CREATE POLICY "invariant_runs_select_admins" ON public.invariant_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin'));

INSERT INTO public.system_invariants (name, description, severity, reference_count, notes) VALUES
 ('tx_fornecedor_outra_empresa','Transações cujo fornecedor pertence a outra empresa','error',0,'Fronteira multi-empresa. Incidente de 12/09 (fusão de fornecedores por IBAN sem company_id).'),
 ('tx_conta_outra_empresa','Transações cuja conta financeira pertence a outra empresa','error',0,'Fronteira multi-empresa.'),
 ('tx_evento_outra_empresa','Transações cujo evento pertence a outra empresa','error',0,'Fronteira multi-empresa.'),
 ('tx_rubrica_outra_empresa','Transações cuja rubrica do plano de contas pertence a outra empresa','error',0,'Só rubricas com empresa definida; as globais (empresa nula) não contam.'),
 ('coala_map_outra_empresa','Mapeamentos Coala a apontar para fornecedor de outra empresa','error',0,'Fronteira multi-empresa.'),
 ('filha_rateio_com_conta','Filhas de rateio (não parcelas) com conta financeira preenchida','error',0,'Exclui parcelas: as parcelas têm conta legitimamente.'),
 ('tipo_invalido','Transações com tipo diferente de receita ou despesa','error',0,'Integridade de domínio.'),
 ('fornecedor_iban_duplicado_ativo','IBAN repetido entre fornecedores ativos da mesma empresa','error',0,'Conta grupos (empresa, IBAN) com mais de um registo ativo.'),
 ('fecho_confirmado_liquido_retido','Fechos de bilheteira confirmados com líquido positivo e nada transferido','error',0,'Dinheiro por transferir num fecho já confirmado.'),
 ('paid_amount_acima_do_bruto','Transações com valor pago acima do bruto (base + IVA), tolerância 0,02 €','warn',9,'Dívida conhecida a 14/09/2026.'),
 ('tx_paga_sem_linha_de_pagamento','Transações pagas sem linha em transaction_payments','warn',1026,'Dívida conhecida — issue #91 (histórico anterior à máquina de pagamentos).'),
 ('pares_fk_duplicada','Pares de tabelas com mais do que uma chave estrangeira entre si','warn',35,'Issue #169: cada par novo é um embed do PostgREST que pode nascer ambíguo.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_invariant_checks()
RETURNS TABLE (
  name text,
  description text,
  severity text,
  current_count bigint,
  reference_count bigint,
  conforme boolean,
  notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint;
  c7 bigint; c8 bigint; c9 bigint; c10 bigint; c11 bigint; c12 bigint;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para correr o verificador de invariantes';
  END IF;

  SELECT count(*) INTO c1
    FROM public.transactions t
    JOIN public.suppliers s ON s.id = t.supplier_id
   WHERE t.company_id IS DISTINCT FROM s.company_id;

  SELECT count(*) INTO c2
    FROM public.transactions t
    JOIN public.financial_accounts a ON a.id = t.account_id
   WHERE t.company_id IS DISTINCT FROM a.company_id;

  SELECT count(*) INTO c3
    FROM public.transactions t
    JOIN public.events e ON e.id = t.event_id
   WHERE t.company_id IS DISTINCT FROM e.company_id;

  SELECT count(*) INTO c4
    FROM public.transactions t
    JOIN public.account_categories c ON c.id = t.category_id
   WHERE c.company_id IS NOT NULL
     AND t.company_id IS DISTINCT FROM c.company_id;

  SELECT count(*) INTO c5
    FROM public.coala_supplier_category_map x
    JOIN public.suppliers s ON s.id = x.supplier_id
   WHERE x.company_id IS DISTINCT FROM s.company_id;

  SELECT count(*) INTO c6
    FROM public.transactions
   WHERE parent_transaction_id IS NOT NULL
     AND installment_group_id IS NULL
     AND account_id IS NOT NULL;

  SELECT count(*) INTO c7
    FROM public.transactions
   WHERE type NOT IN ('income','expense');

  SELECT count(*) INTO c8
    FROM (
      SELECT company_id, iban
        FROM public.suppliers
       WHERE is_active
         AND iban IS NOT NULL
         AND iban <> ''
       GROUP BY company_id, iban
      HAVING count(*) > 1
    ) d;

  SELECT count(*) INTO c9
    FROM public.ticket_office_settlements
   WHERE status = 'confirmed'
     AND COALESCE(net_transferred, 0) = 0
     AND COALESCE(net_adjusted, net_calculated) > 0.01;

  SELECT count(*) INTO c10
    FROM public.transactions
   WHERE COALESCE(paid_amount, 0) > amount * (1 + COALESCE(iva_rate, 0) / 100.0) + 0.02;

  SELECT count(*) INTO c11
    FROM public.transactions t
   WHERE t.status = 'paid'
     AND COALESCE(t.paid_amount, 0) > 0
     AND t.parent_transaction_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id
     );

  SELECT count(*) INTO c12
    FROM (
      SELECT k.conrelid, k.confrelid
        FROM pg_catalog.pg_constraint k
        JOIN pg_catalog.pg_class rel ON rel.oid = k.conrelid
        JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE k.contype = 'f'
         AND ns.nspname = 'public'
       GROUP BY k.conrelid, k.confrelid
      HAVING count(*) > 1
    ) f;

  RETURN QUERY
  SELECT i.name,
         i.description,
         i.severity,
         v.cnt,
         i.reference_count,
         (v.cnt = i.reference_count) AS conforme,
         i.notes
    FROM public.system_invariants i
    JOIN (VALUES
      ('tx_fornecedor_outra_empresa', c1),
      ('tx_conta_outra_empresa', c2),
      ('tx_evento_outra_empresa', c3),
      ('tx_rubrica_outra_empresa', c4),
      ('coala_map_outra_empresa', c5),
      ('filha_rateio_com_conta', c6),
      ('tipo_invalido', c7),
      ('fornecedor_iban_duplicado_ativo', c8),
      ('fecho_confirmado_liquido_retido', c9),
      ('paid_amount_acima_do_bruto', c10),
      ('tx_paga_sem_linha_de_pagamento', c11),
      ('pares_fk_duplicada', c12)
    ) AS v(name, cnt) ON v.name = i.name
   ORDER BY (v.cnt = i.reference_count), i.severity, i.name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_invariant_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_invariant_checks() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_invariant_checks_and_log()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_rows jsonb;
  v_drift integer;
  v_run_id uuid;
  v_lines text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para correr o verificador de invariantes';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_rows
    FROM public.run_invariant_checks() r;

  SELECT count(*) INTO v_drift
    FROM jsonb_array_elements(v_rows) e
   WHERE (e->>'conforme')::boolean IS FALSE;

  INSERT INTO public.invariant_runs (ran_by, drift_count, results)
  VALUES (auth.uid(), v_drift, v_rows)
  RETURNING id INTO v_run_id;

  IF v_drift > 0 THEN
    SELECT string_agg(
             format('- %s: %s (referencia %s)', e->>'name', e->>'current_count', e->>'reference_count'),
             chr(10) ORDER BY e->>'name')
      INTO v_lines
      FROM jsonb_array_elements(v_rows) e
     WHERE (e->>'conforme')::boolean IS FALSE;

    INSERT INTO public.system_reminders (key, title, message, due_date, frequency, link_url, is_active)
    VALUES (
      'invariant_drift',
      'Verificador de invariantes: ' || v_drift || ' verificacao(oes) fora da referencia',
      v_lines,
      CURRENT_DATE,
      'daily',
      'https://mpgestaoeventos.com/admin/invariantes',
      true
    )
    ON CONFLICT (key) DO UPDATE SET
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      due_date = CURRENT_DATE,
      is_active = true,
      completed_at = NULL,
      updated_at = now();
  ELSE
    UPDATE public.system_reminders
       SET is_active = false, completed_at = now(), updated_at = now()
     WHERE key = 'invariant_drift' AND completed_at IS NULL;
  END IF;

  RETURN v_run_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_invariant_checks_and_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_invariant_checks_and_log() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_invariant_reference(_name text, _new_reference bigint, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para alterar valores de referencia';
  END IF;
  IF _note IS NULL OR btrim(_note) = '' THEN
    RAISE EXCEPTION 'Nota obrigatoria para aceitar uma nova referencia';
  END IF;
  IF _new_reference IS NULL OR _new_reference < 0 THEN
    RAISE EXCEPTION 'Valor de referencia invalido';
  END IF;

  UPDATE public.system_invariants
     SET reference_count = _new_reference,
         reference_updated_by = auth.uid(),
         reference_updated_at = now(),
         notes = COALESCE(notes || chr(10), '')
                 || to_char(now(), 'YYYY-MM-DD') || ' - referencia passou a ' || _new_reference || ': ' || btrim(_note),
         updated_at = now()
   WHERE name = _name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verificacao % nao existe', _name;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.accept_invariant_reference(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invariant_reference(text, bigint, text) TO authenticated, service_role;