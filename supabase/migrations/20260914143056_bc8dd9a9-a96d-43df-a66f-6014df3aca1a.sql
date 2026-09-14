ALTER TABLE public.system_invariants
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_invariants_scope_check') THEN
    ALTER TABLE public.system_invariants
      ADD CONSTRAINT system_invariants_scope_check CHECK (scope IN ('empresa','global'));
  END IF;
END $$;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES
  ('BP_DESPESA_EM_L2', 'Linha de BP de despesa numa rubrica que nao e de nivel 3', 'error', 'empresa', 0,
   'Regra de negocio: so folhas L3 sao selecionaveis.'),
  ('TX_EVENTO_SEM_RUBRICA', 'Transacao com evento mas sem rubrica', 'warn', 'empresa', 13,
   'Divida herdada: 13 linhas a 14/09/2026, valor de hoje aceito como referencia.'),
  ('VINCULO_CROSS_EVENTO', 'Vinculo BP <-> transacao entre eventos diferentes', 'error', 'empresa', 0,
   'Transacoes sem evento sao legitimas no matching e nao contam.'),
  ('VINCULO_DESSINCRONIZADO', 'Escrita dupla fora de sincronia (ancora sem back-link)', 'error', 'empresa', 7,
   'Divida herdada: 7 linhas a 14/09/2026, valor de hoje aceito como referencia.'),
  ('FORECAST_ID_ORFAO', 'transactions.forecast_id aponta para linha de BP inexistente', 'error', 'empresa', 0,
   'Integridade do vinculo BP <-> transacoes.'),
  ('TRIGGER_DOCUMENTADO_SEM_LIGACAO', 'Funcao de trigger sem nenhum trigger associado', 'warn', 'empresa', 4,
   'Divida herdada: 4 funcoes a 14/09/2026, valor de hoje aceito como referencia.')
ON CONFLICT (name) DO NOTHING;

-- REGRA DE ADMISSAO DE NOVOS INVARIANTES (escrita antes de nos, mantem-se)
-- So entra neste verificador o que distinga com fiabilidade uma violacao de um
-- caso legitimo do negocio. Sinais heuristicos nao entram como 'error': um
-- verificador que nunca chega a zero deixa de ser lido e destroi a confianca
-- nos restantes -- exatamente o problema que este verificador existe para resolver.
-- Candidatas rejeitadas, nao reintroduzir: "filha de rateio com conta" sem excluir
-- parcelas; "grupo de fatura com documentos diferentes" comparando file_url;
-- BP_LINHAS_DUPLICADAS (removida em 28/08/2026: parcelamentos e mensalidades
-- repetem-se legitimamente).
-- O SQL das verificacoes vive DENTRO da funcao, nunca em coluna de texto executada.
-- As verificacoes de ambito 'empresa' sao contadas em TODAS as empresas (a amostra
-- traz company_id) para que contagem e referencia sejam estaveis no cron.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()
RETURNS TABLE(
  name text, description text, severity text, scope text,
  current_count bigint, reference_count bigint, conforme boolean,
  notes text, sample jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint;
  c7 bigint; c8 bigint; c9 bigint; c10 bigint; c11 bigint; c12 bigint;
  c13 bigint; c14 bigint; c15 bigint; c16 bigint; c17 bigint; c18 bigint;
  s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb; s5 jsonb; s6 jsonb;
  s7 jsonb; s8 jsonb; s9 jsonb; s10 jsonb; s11 jsonb; s12 jsonb;
  s13 jsonb; s14 jsonb; s15 jsonb; s16 jsonb; s17 jsonb; s18 jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.transactions t
      JOIN public.suppliers s ON s.id = t.supplier_id
     WHERE t.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c1, s1 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, a.company_id AS account_company, a.name AS account_name
      FROM public.transactions t
      JOIN public.financial_accounts a ON a.id = t.account_id
     WHERE t.company_id IS DISTINCT FROM a.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c2, s2 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, e.company_id AS event_company, e.name AS event_name
      FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
     WHERE t.company_id IS DISTINCT FROM e.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c3, s3 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, c.company_id AS category_company, c.code AS category_code
      FROM public.transactions t
      JOIN public.account_categories c ON c.id = t.category_id
     WHERE c.company_id IS NOT NULL
       AND t.company_id IS DISTINCT FROM c.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c4, s4 FROM bad;

  WITH bad AS (
    SELECT x.id AS map_id, x.company_id AS map_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.coala_supplier_category_map x
      JOIN public.suppliers s ON s.id = x.supplier_id
     WHERE x.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT * FROM bad LIMIT 5) y), '[]'::jsonb)
    INTO c5, s5 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.parent_transaction_id, t.account_id, t.company_id
      FROM public.transactions t
     WHERE t.parent_transaction_id IS NOT NULL
       AND t.installment_group_id IS NULL
       AND t.account_id IS NOT NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c6, s6 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.type, t.company_id
      FROM public.transactions t
     WHERE t.type NOT IN ('income','expense')
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c7, s7 FROM bad;

  WITH bad AS (
    SELECT s.company_id, s.iban, count(*) AS fornecedores, string_agg(s.name, ' | ') AS nomes
      FROM public.suppliers s
     WHERE s.is_active AND s.iban IS NOT NULL AND s.iban <> ''
     GROUP BY s.company_id, s.iban
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c8, s8 FROM bad;

  WITH bad AS (
    SELECT t.id AS settlement_id, t.event_id, t.net_calculated, t.net_adjusted, t.net_transferred
      FROM public.ticket_office_settlements t
     WHERE t.status = 'confirmed'
       AND COALESCE(t.net_transferred, 0) = 0
       AND COALESCE(t.net_adjusted, t.net_calculated) > 0.01
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c9, s9 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.amount, t.iva_rate, t.paid_amount, t.company_id
      FROM public.transactions t
     WHERE COALESCE(t.paid_amount, 0) > t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0) + 0.02
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c10, s10 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.paid_amount, t.payment_date, t.company_id
      FROM public.transactions t
     WHERE t.status = 'paid'
       AND COALESCE(t.paid_amount, 0) > 0
       AND t.parent_transaction_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c11, s11 FROM bad;

  WITH bad AS (
    SELECT rel.relname AS tabela, frel.relname AS aponta_para, count(*) AS fks,
           string_agg(k.conname, ' | ') AS constraints
      FROM pg_catalog.pg_constraint k
      JOIN pg_catalog.pg_class rel ON rel.oid = k.conrelid
      JOIN pg_catalog.pg_class frel ON frel.oid = k.confrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE k.contype = 'f' AND ns.nspname = 'public'
     GROUP BY rel.relname, frel.relname
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY fks DESC, tabela LIMIT 5) x), '[]'::jsonb)
    INTO c12, s12 FROM bad;

  WITH lvl AS (
    SELECT c.id,
           CASE WHEN c.parent_id IS NULL THEN 1 WHEN p.parent_id IS NULL THEN 2 ELSE 3 END AS lv,
           c.code, c.name
      FROM public.account_categories c
      LEFT JOIN public.account_categories p ON p.id = c.parent_id
  ),
  bad AS (
    SELECT f.id, f.company_id, f.event_id, f.description, f.amount, lvl.code AS cat_code, lvl.name AS cat_name, lvl.lv
      FROM public.event_forecasts f
      JOIN lvl ON lvl.id = f.category_id
     WHERE f.version_id IS NULL AND f.type = 'expense' AND lvl.lv <> 3
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c13, s13 FROM bad;

  WITH bad AS (
    SELECT t.id, t.company_id, t.event_id, t.description, t.amount, t.date
      FROM public.transactions t
     WHERE t.event_id IS NOT NULL AND t.category_id IS NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c14, s14 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, f.id AS forecast_id, t.event_id AS tx_event_id,
           f.event_id AS forecast_event_id, 'forecast_id' AS via
      FROM public.transactions t
      JOIN public.event_forecasts f ON f.id = t.forecast_id
     WHERE t.event_id IS NOT NULL AND t.event_id <> f.event_id
    UNION ALL
    SELECT t.id, t.company_id, f.id, t.event_id, f.event_id, 'anchor'
      FROM public.event_forecasts f
      JOIN public.transactions t ON t.id = f.transaction_id
     WHERE f.version_id IS NULL AND t.event_id IS NOT NULL AND t.event_id <> f.event_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c15, s15 FROM bad;

  WITH bad AS (
    SELECT f.id AS forecast_id, f.company_id, f.event_id, f.description,
           t.id AS anchor_transaction_id, t.forecast_id AS tx_forecast_id
      FROM public.event_forecasts f
      JOIN public.transactions t ON t.id = f.transaction_id
     WHERE f.version_id IS NULL AND t.forecast_id IS DISTINCT FROM f.id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c16, s16 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.forecast_id, t.event_id, t.description
      FROM public.transactions t
     WHERE t.forecast_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.event_forecasts f WHERE f.id = t.forecast_id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c17, s17 FROM bad;

  WITH bad AS (
    SELECT p.proname AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
       AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY function_name LIMIT 5) x), '[]'::jsonb)
    INTO c18, s18 FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         v.cnt, i.reference_count, (v.cnt = i.reference_count) AS conforme,
         i.notes, v.smp
    FROM public.system_invariants i
    JOIN (VALUES
      ('tx_fornecedor_outra_empresa', c1, s1),
      ('tx_conta_outra_empresa', c2, s2),
      ('tx_evento_outra_empresa', c3, s3),
      ('tx_rubrica_outra_empresa', c4, s4),
      ('coala_map_outra_empresa', c5, s5),
      ('filha_rateio_com_conta', c6, s6),
      ('tipo_invalido', c7, s7),
      ('fornecedor_iban_duplicado_ativo', c8, s8),
      ('fecho_confirmado_liquido_retido', c9, s9),
      ('paid_amount_acima_do_bruto', c10, s10),
      ('tx_paga_sem_linha_de_pagamento', c11, s11),
      ('pares_fk_duplicada', c12, s12),
      ('BP_DESPESA_EM_L2', c13, s13),
      ('TX_EVENTO_SEM_RUBRICA', c14, s14),
      ('VINCULO_CROSS_EVENTO', c15, s15),
      ('VINCULO_DESSINCRONIZADO', c16, s16),
      ('FORECAST_ID_ORFAO', c17, s17),
      ('TRIGGER_DOCUMENTADO_SEM_LIGACAO', c18, s18)
    ) AS v(name, cnt, smp) ON v.name = i.name
   ORDER BY i.scope, (v.cnt = i.reference_count), i.severity, i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM anon;
REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM authenticated;

DROP FUNCTION IF EXISTS public.run_invariant_checks();
CREATE OR REPLACE FUNCTION public.run_invariant_checks()
RETURNS TABLE(
  name text, description text, severity text, scope text,
  current_count bigint, reference_count bigint, conforme boolean,
  notes text, sample jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para correr o verificador de invariantes';
  END IF;
  RETURN QUERY SELECT * FROM public._run_invariant_checks_raw();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.run_invariant_checks() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_system_invariants()
RETURNS TABLE(code text, severity text, title text, offenders bigint, sample jsonb, checked_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin')
          OR public.has_role(auth.uid(),'manager')
          OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'check_system_invariants: apenas admin, manager ou platform_admin';
  END IF;

  RETURN QUERY
  SELECT r.name, r.severity, r.description, r.current_count, r.sample, now()
    FROM public._run_invariant_checks_raw() r
   WHERE r.scope = 'empresa'
   ORDER BY r.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_system_invariants() TO authenticated;

CREATE OR REPLACE FUNCTION public.run_invariant_checks_and_log()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', r.name, 'description', r.description, 'severity', r.severity,
           'scope', r.scope, 'current_count', r.current_count,
           'reference_count', r.reference_count, 'conforme', r.conforme)), '[]'::jsonb)
    INTO v_rows
    FROM public._run_invariant_checks_raw() r;

  SELECT count(*) INTO v_drift
    FROM jsonb_array_elements(v_rows) e
   WHERE (e->>'conforme')::boolean IS FALSE;

  INSERT INTO public.invariant_runs (ran_by, drift_count, results)
  VALUES (auth.uid(), v_drift, v_rows)
  RETURNING id INTO v_run_id;

  IF v_drift > 0 THEN
    SELECT string_agg(
             format('- %s [%s]: %s (referencia %s)', e->>'name', e->>'scope', e->>'current_count', e->>'reference_count'),
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
$function$;