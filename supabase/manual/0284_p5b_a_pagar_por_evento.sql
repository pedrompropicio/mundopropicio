-- 0284 (D-ERP325, P5b passo 1): adds a_pagar.por_evento and a_pagar.por_evento_nota to
-- get_financial_position_base. Additive only: every existing key keeps its value; gate unchanged.
-- Base: body of 0283 (md5 fd18f727860fc1d2f550f474812756b0).

CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ref date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_pa boolean;
  v_admin boolean;
  v_view boolean;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_pa := public.is_platform_admin(v_uid);
  IF p_company_id IS NULL
     OR (p_company_id IS DISTINCT FROM public.current_company_id() AND NOT v_pa) THEN
    RAISE EXCEPTION 'company_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT v_pa AND NOT public.has_permission(v_uid, 'view_financial_position') THEN
    RAISE EXCEPTION 'financial_position_permission_denied' USING ERRCODE = '42501';
  END IF;
  -- Balance visibility identical to ticket_office_balances.
  v_admin := v_pa OR public.has_role(v_uid, 'admin'::public.app_role);
  v_view := public.has_permission(v_uid, 'view_balances');

  WITH RECURSIVE tree AS (
    SELECT e.id, e.id AS root_id, 0 AS depth
    FROM public.events e
    WHERE e.company_id = p_company_id AND e.parent_event_id IS NULL
    UNION ALL
    SELECT c.id, t.root_id, t.depth + 1
    FROM public.events c JOIN tree t ON c.parent_event_id = t.id
    WHERE c.company_id = p_company_id AND t.depth < 16
  ),
  roots AS (
    SELECT r.id AS root_id, r.name,
      public.event_stage(r.id) AS stage,
      (SELECT min(x.d) FROM (
         SELECT e2.date AS d FROM tree t2 JOIN public.events e2 ON e2.id = t2.id WHERE t2.root_id = r.id
         UNION ALL
         SELECT ed.date FROM tree t3 JOIN public.event_dates ed ON ed.event_id = t3.id WHERE t3.root_id = r.id
      ) x) AS first_day,
      (SELECT count(*) - 1 FROM tree t4 WHERE t4.root_id = r.id) AS sub_count
    FROM public.events r
    WHERE r.company_id = p_company_id AND r.parent_event_id IS NULL
  ),
  rs AS (
    SELECT roots.*,
      (roots.first_day IS NOT NULL AND roots.first_day <= v_ref) AS started
    FROM roots
    WHERE p_year IS NULL OR extract(year FROM roots.first_day)::int = p_year
  ),
  ev AS (
    SELECT t.id AS event_id, rs.root_id, rs.stage, rs.started,
      (rs.started AND rs.stage IN ('em_curso','em_fecho','fechado')) AS bp_counts
    FROM tree t JOIN rs ON rs.root_id = t.root_id
    WHERE rs.stage NOT IN ('historico','cancelado')
  ),
  -- Transactions of counted events. Rateio mothers (children + no installment chain + no event)
  -- never join an event; the predicate is kept explicit for safety.
  tx AS (
    SELECT t.id, t.type, t.event_id, t.forecast_id, t.amount, t.status,
      coalesce(t.is_transitory, false) AS is_transitory, t.transitory_reason,
      coalesce(t.exclude_from_result, false) OR coalesce(t.is_hidden, false) AS blocking_extra,
      ev.root_id, ev.stage, ev.bp_counts,
      t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0) AS bruto,
      coalesce(t.paid_amount,
        CASE WHEN t.status = 'paid' THEN t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0) ELSE 0 END) AS pago,
      ac.code AS cat_code
    FROM public.transactions t
    JOIN ev ON ev.event_id = t.event_id
    LEFT JOIN public.account_categories ac ON ac.id = t.category_id
    WHERE t.company_id = p_company_id
      AND t.reversed_at IS NULL
      AND t.status IN ('approved','paid')
      AND t.paying_partner_id IS NULL
      AND NOT (t.installment_total IS NULL AND t.event_id IS NULL
               AND EXISTS (SELECT 1 FROM public.transactions ch WHERE ch.parent_transaction_id = t.id))
  ),
  -- Active cache contracts replace the cache_module line of the same forecast_id (never summed).
  contr AS (
    SELECT cc.forecast_id, sum(cc.quota) AS quota_sum
    FROM public.cache_payment_contract_cities cc
    JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
    WHERE k.company_id = p_company_id AND k.cancelled_at IS NULL AND cc.forecast_id IS NOT NULL
    GROUP BY cc.forecast_id
  ),
  -- BP lines: same filter as computeBpLineReview (expense, approved, operational, live version),
  -- minus partner-paid lines, only in events that already started and are em_curso/em_fecho/fechado.
  bp AS (
    SELECT f.id, f.event_id, ev.root_id, ev.stage, f.amount,
      coalesce(c.quota_sum, f.amount * (1 + coalesce(f.iva_rate, 0) / 100.0)) AS custo,
      (c.quota_sum IS NOT NULL) AS via_contrato
    FROM public.event_forecasts f
    JOIN ev ON ev.event_id = f.event_id AND ev.bp_counts
    LEFT JOIN contr c ON c.forecast_id = f.id
    WHERE f.company_id = p_company_id
      AND f.type = 'expense' AND f.status = 'approved' AND f.version_id IS NULL
      AND NOT coalesce(f.is_transitory, false)
      AND NOT coalesce(f.is_overhead, false)
      AND NOT coalesce(f.exclude_from_result, false)
      AND f.paying_partner_id IS NULL
  ),
  lt AS (
    SELECT tx.forecast_id, sum(tx.pago) AS pago,
      sum(greatest(tx.bruto - tx.pago, 0)) AS aberto_tx, count(*) AS n_tx
    FROM tx WHERE tx.type = 'expense' AND NOT tx.is_transitory AND tx.forecast_id IS NOT NULL
    GROUP BY tx.forecast_id
  ),
  -- Verba por usar net balance (computeBpLineReview: realized = approved/paid without blocking flags).
  vn AS (
    SELECT t.forecast_id, sum(t.amount) AS real_net
    FROM public.transactions t
    WHERE t.company_id = p_company_id AND t.type = 'expense' AND t.forecast_id IS NOT NULL
      AND t.status IN ('approved','paid','partially_paid')
      AND NOT coalesce(t.is_transitory, false) AND NOT coalesce(t.exclude_from_result, false)
      AND t.reversed_at IS NULL AND NOT coalesce(t.is_hidden, false)
    GROUP BY t.forecast_id
  ),
  rev AS (
    SELECT DISTINCT ON (r.forecast_id) r.forecast_id, r.decision, r.saldo_at_review
    FROM public.event_bp_line_reviews r
    WHERE r.company_id = p_company_id
    ORDER BY r.forecast_id, r.reviewed_at DESC
  ),
  line AS (
    SELECT bp.*, coalesce(lt.pago, 0) AS pago, coalesce(lt.aberto_tx, 0) AS aberto_tx,
      coalesce(lt.n_tx, 0) AS n_tx,
      greatest(bp.custo - coalesce(lt.pago, 0), 0) AS a_pagar,
      CASE WHEN rev.forecast_id IS NOT NULL
            AND abs(rev.saldo_at_review - (bp.amount - coalesce(vn.real_net, 0))) <= 0.01
           THEN rev.decision END AS decisao
    FROM bp
    LEFT JOIN lt ON lt.forecast_id = bp.id
    LEFT JOIN vn ON vn.forecast_id = bp.id
    LEFT JOIN rev ON rev.forecast_id = bp.id
  ),
  ls AS (
    SELECT line.*,
      least(line.aberto_tx, line.a_pagar) AS lancado,
      line.a_pagar - least(line.aberto_tx, line.a_pagar) AS saldo,
      CASE line.decisao WHEN 'pending_invoice' THEN 'confirmado' WHEN 'adjusted' THEN 'ajustado'
                        WHEN 'partner_paid' THEN 'partner_paid' ELSE 'por_rever' END AS bucket
    FROM line
  ),
  -- Transactions counted on their own value: all tx of events where BP does not count;
  -- in BP events only tx without a counted BP line (no double count via forecast_id).
  txo AS (
    SELECT tx.*, greatest(tx.bruto - tx.pago, 0) AS aberto
    FROM tx
    WHERE tx.type = 'expense' AND NOT tx.is_transitory
      AND (NOT tx.bp_counts
           OR tx.forecast_id IS NULL
           OR (NOT EXISTS (SELECT 1 FROM bp WHERE bp.id = tx.forecast_id)
               AND NOT EXISTS (SELECT 1 FROM public.event_forecasts pf
                               WHERE pf.id = tx.forecast_id AND pf.paying_partner_id IS NOT NULL)))
  ),
  -- 0284 (D-ERP325): informative BP of ALL counted events (also started=false), same filters as bp.
  -- Never enters por_estagio nor total.
  bpx AS (
    SELECT f.id, ev.root_id, f.amount,
      coalesce(c.quota_sum, f.amount * (1 + coalesce(f.iva_rate, 0) / 100.0)) AS custo
    FROM public.event_forecasts f
    JOIN ev ON ev.event_id = f.event_id
    LEFT JOIN contr c ON c.forecast_id = f.id
    WHERE f.company_id = p_company_id
      AND f.type = 'expense' AND f.status = 'approved' AND f.version_id IS NULL
      AND NOT coalesce(f.is_transitory, false)
      AND NOT coalesce(f.is_overhead, false)
      AND NOT coalesce(f.exclude_from_result, false)
      AND f.paying_partner_id IS NULL
  ),
  bpxl AS (
    SELECT bpx.root_id, bpx.custo,
      greatest(bpx.custo - coalesce(lt.pago, 0) - coalesce(lt.aberto_tx, 0), 0) AS por_lancar
    FROM bpx
    LEFT JOIN lt ON lt.forecast_id = bpx.id
    LEFT JOIN vn ON vn.forecast_id = bpx.id
    LEFT JOIN rev ON rev.forecast_id = bpx.id
    WHERE (CASE WHEN rev.forecast_id IS NOT NULL
                 AND abs(rev.saldo_at_review - (bpx.amount - coalesce(vn.real_net, 0))) <= 0.01
                THEN rev.decision END) IS DISTINCT FROM 'partner_paid'
  ),
  pev AS (
    SELECT rs.root_id, rs.stage, rs.first_day, rs.started,
      coalesce((SELECT sum(ls.lancado) + sum(CASE WHEN ls.bucket <> 'partner_paid' THEN ls.saldo ELSE 0 END)
                FROM ls WHERE ls.root_id = rs.root_id), 0)
      + coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.root_id = rs.root_id), 0) AS a_pagar_total,
      coalesce((SELECT sum(ls.lancado) FROM ls WHERE ls.root_id = rs.root_id), 0)
      + coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.root_id = rs.root_id), 0) AS a_pagar_lancado,
      coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.root_id = rs.root_id
                AND (txo.forecast_id IS NULL OR NOT EXISTS (SELECT 1 FROM bpx WHERE bpx.id = txo.forecast_id))), 0) AS a_pagar_sem_linha,
      coalesce((SELECT sum(bpxl.custo) FROM bpxl WHERE bpxl.root_id = rs.root_id), 0) AS bp_total,
      coalesce((SELECT sum(bpxl.por_lancar) FROM bpxl WHERE bpxl.root_id = rs.root_id), 0) AS bp_por_lancar,
      coalesce((SELECT sum(tx.pago) FROM tx WHERE tx.root_id = rs.root_id
                AND tx.type = 'expense' AND NOT tx.is_transitory), 0) AS despesas_pagas
    FROM rs WHERE rs.stage IN ('planeamento','em_curso','em_fecho','fechado')
  ),
  stages AS (SELECT unnest(ARRAY['planeamento','em_curso','em_fecho','fechado']) AS stage),
  pay AS (
    SELECT s.stage,
      coalesce((SELECT sum(ls.lancado) + sum(CASE WHEN ls.bucket <> 'partner_paid' THEN ls.saldo ELSE 0 END)
                FROM ls WHERE ls.stage = s.stage), 0) AS bp_total,
      coalesce((SELECT sum(ls.lancado) FROM ls WHERE ls.stage = s.stage), 0) AS bp_lancado,
      coalesce((SELECT sum(ls.saldo) FROM ls WHERE ls.stage = s.stage AND ls.bucket = 'confirmado'), 0) AS confirmado,
      coalesce((SELECT sum(ls.saldo) FROM ls WHERE ls.stage = s.stage AND ls.bucket = 'por_rever'), 0) AS por_rever,
      coalesce((SELECT sum(ls.saldo) FROM ls WHERE ls.stage = s.stage AND ls.bucket = 'ajustado'), 0) AS ajustado,
      coalesce((SELECT sum(ls.saldo) FROM ls WHERE ls.stage = s.stage AND ls.bucket = 'partner_paid'), 0) AS partner_paid,
      (SELECT count(*) FROM ls WHERE ls.stage = s.stage AND ls.a_pagar > 0.005) AS bp_linhas,
      (SELECT count(*) FROM ls WHERE ls.stage = s.stage AND ls.via_contrato) AS linhas_contrato,
      coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.stage = s.stage AND txo.bp_counts), 0) AS sem_bp,
      (SELECT count(*) FROM txo WHERE txo.stage = s.stage AND txo.bp_counts AND txo.aberto > 0.005) AS sem_bp_n,
      coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.stage = s.stage AND NOT txo.bp_counts), 0) AS so_transacoes,
      (SELECT count(*) FROM txo WHERE txo.stage = s.stage AND NOT txo.bp_counts AND txo.aberto > 0.005) AS so_transacoes_n
    FROM stages s
  ),
  rec AS (
    SELECT s.stage,
      coalesce((SELECT sum(greatest(tx.bruto - tx.pago, 0)) FROM tx
                WHERE tx.stage = s.stage AND tx.type = 'income' AND NOT tx.is_transitory
                  AND coalesce(tx.cat_code, '') NOT LIKE '1.1%'), 0) AS total,
      (SELECT count(*) FROM tx
        WHERE tx.stage = s.stage AND tx.type = 'income' AND NOT tx.is_transitory
          AND coalesce(tx.cat_code, '') NOT LIKE '1.1%' AND tx.bruto - tx.pago > 0.005) AS n
    FROM stages s
  ),
  trans AS (
    SELECT tx.type, coalesce(tx.transitory_reason, '') AS reason,
      count(*) AS n, sum(greatest(tx.bruto - tx.pago, 0)) AS aberto
    FROM tx
    WHERE tx.is_transitory AND tx.bruto - tx.pago > 0.005
    GROUP BY 1, 2
  ),
  acc AS (
    SELECT a.id, a.name, a.type, coalesce(a.is_hidden, false) AS is_hidden, a.initial_balance_date,
      CASE WHEN v_admin OR (v_view AND coalesce(a.balance_visible_to_all, false))
           THEN public._account_true_balance_raw(a.id) END AS saldo
    FROM public.financial_accounts a
    WHERE a.company_id = p_company_id AND coalesce(a.is_active, true)
      AND NOT coalesce(a.skip_balance_check, false)
      AND a.type IN ('bank','cash','prepaid_card')
  ),
  tob AS (
    SELECT a.id, a.name, coalesce(a.is_hidden, false) AS is_hidden, b.balance
    FROM public.financial_accounts a
    JOIN public.ticket_office_balances(ARRAY(
      SELECT x.id FROM public.financial_accounts x
      WHERE x.company_id = p_company_id AND x.type = 'ticket_office' AND coalesce(x.is_active, true)
        AND NOT coalesce(x.skip_balance_check, false))) b ON b.account_id = a.id
  ),
  acerto AS (
    SELECT a.id, a.name,
      CASE WHEN v_admin OR (v_view AND coalesce(a.balance_visible_to_all, false))
           THEN public._account_true_balance_raw(a.id) END AS saldo
    FROM public.financial_accounts a
    WHERE a.company_id = p_company_id AND a.type = 'other' AND coalesce(a.is_active, true)
      AND (a.name ILIKE 'Acerto %' OR a.name ILIKE 'Conta Corrente%')
  ),
  caucao AS (
    SELECT coalesce(sum(CASE WHEN t.type = 'expense' THEN coalesce(t.paid_amount, 0)
                             ELSE -coalesce(t.paid_amount, 0) END), 0) AS a_recuperar,
      count(*) AS n
    FROM public.transactions t
    WHERE t.company_id = p_company_id AND t.is_transitory AND t.transitory_reason = 'caucao'
      AND t.reversed_at IS NULL AND t.status IN ('approved','paid')
  ),
  tot AS (
    SELECT
      (SELECT sum(saldo) FROM acc WHERE type IN ('bank','cash')) AS caixa,
      (SELECT sum(saldo) FROM acc WHERE type = 'prepaid_card') AS cartoes,
      (SELECT sum(balance) FROM tob WHERE NOT is_hidden) AS retido_vis,
      (SELECT sum(balance) FROM tob WHERE is_hidden) AS retido_oc,
      (SELECT sum(bp_total + sem_bp + so_transacoes) FROM pay) AS a_pagar,
      (SELECT coalesce(sum(aberto), 0) FROM trans WHERE type = 'expense') AS trans_pagar,
      (SELECT sum(total) FROM rec) AS a_receber,
      (SELECT coalesce(sum(aberto), 0) FROM trans WHERE type = 'income') AS trans_receber
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', p_company_id, 'year', p_year, 'reference_date', v_ref,
      'timezone', 'Europe/Lisbon', 'version', 'p4-v1',
      'balances_visible', v_admin OR v_view,
      'notes', 'Caixa e retido nunca somam (D-ERP27). Resultado e parte da MP vêm do P5.'),
    'eventos_por_estagio', (
      SELECT coalesce(jsonb_object_agg(g.stage, g.items), '{}'::jsonb) FROM (
        SELECT rs.stage, jsonb_agg(jsonb_build_object(
          'event_id', rs.root_id, 'name', rs.name, 'first_day', rs.first_day,
          'started', rs.started, 'sub_events', rs.sub_count) ORDER BY rs.first_day NULLS LAST) AS items
        FROM rs GROUP BY rs.stage) g),
    'caixa', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'name', name, 'type', type,
               'is_hidden', is_hidden, 'cutoff', initial_balance_date, 'saldo', round(saldo, 2)) ORDER BY name), '[]'::jsonb)
              FROM acc WHERE type IN ('bank','cash')),
    'cartoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'name', name,
               'saldo', round(saldo, 2)) ORDER BY name), '[]'::jsonb) FROM acc WHERE type = 'prepaid_card'),
    'retido', jsonb_build_object(
      'visivel', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'name', name, 'saldo', round(balance, 2)) ORDER BY name), '[]'::jsonb) FROM tob WHERE NOT is_hidden),
      'ocultas', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'name', name, 'saldo', round(balance, 2)) ORDER BY name), '[]'::jsonb) FROM tob WHERE is_hidden),
      'total_visiveis', (SELECT round(retido_vis, 2) FROM tot),
      'total_ocultas', (SELECT round(retido_oc, 2) FROM tot)),
    'a_pagar', jsonb_build_object(
      'por_estagio', (SELECT jsonb_object_agg(stage, jsonb_build_object(
          'total', round(bp_total + sem_bp + so_transacoes, 2),
          'bp', round(bp_total, 2), 'bp_linhas', bp_linhas, 'linhas_contrato_cache', linhas_contrato,
          'sublinhas', jsonb_build_object(
             'lancado', round(bp_lancado, 2), 'confirmado', round(confirmado, 2),
             'por_rever', round(por_rever, 2), 'ajustado', round(ajustado, 2),
             'partner_paid_fora_do_total', round(partner_paid, 2)),
          'sem_bp', jsonb_build_object('total', round(sem_bp, 2), 'n', sem_bp_n),
          'so_transacoes', jsonb_build_object('total', round(so_transacoes, 2), 'n', so_transacoes_n)))
        FROM pay),
      'por_evento', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'evento_id', root_id, 'estagio', stage, 'first_day', first_day, 'started', started,
          'a_pagar_total', round(a_pagar_total, 2), 'a_pagar_lancado', round(a_pagar_lancado, 2),
          'a_pagar_sem_linha', round(a_pagar_sem_linha, 2),
          'bp_total', round(bp_total, 2), 'bp_por_lancar', round(bp_por_lancar, 2),
          'despesas_pagas', round(despesas_pagas, 2))
          ORDER BY first_day NULLS LAST, root_id), '[]'::jsonb) FROM pev),
      'por_evento_nota', 'a_pagar_total soma por estágio a por_estagio.total. bp_total e bp_por_lancar são informativos, calculados mesmo com started=false, e não entram no a pagar.',
      'total', (SELECT round(a_pagar, 2) FROM tot),
      'transitorias', jsonb_build_object('total', (SELECT round(trans_pagar, 2) FROM tot),
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n, 'aberto', round(aberto, 2))), '[]'::jsonb)
                  FROM trans WHERE type = 'expense'))),
    'a_receber', jsonb_build_object(
      'por_estagio', (SELECT jsonb_object_agg(stage, jsonb_build_object('total', round(total, 2), 'n', n)) FROM rec),
      'total', (SELECT round(a_receber, 2) FROM tot),
      'transitorias', jsonb_build_object('total', (SELECT round(trans_receber, 2) FROM tot),
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n, 'aberto', round(aberto, 2))), '[]'::jsonb)
                  FROM trans WHERE type = 'income'))),
    'acerto_informativo', jsonb_build_object(
      'fora_do_total', true,
      'contas', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'name', name, 'saldo', round(saldo, 2)) ORDER BY name), '[]'::jsonb) FROM acerto),
      'a_recuperar_caucao', (SELECT jsonb_build_object('total', round(a_recuperar, 2), 'n', n) FROM caucao)),
    'operacoes_terceiros_informativo', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', o.event_id, 'kind', o.kind, 'name', o.name,
        'gross_amount', o.gross_amount, 'operator_result', o.operator_result)), '[]'::jsonb)
      FROM public.event_third_party_operations o JOIN ev ON ev.event_id = o.event_id
      WHERE o.company_id = p_company_id),
    'alertas', jsonb_build_object(
      'pago_acima_do_bp', (SELECT jsonb_build_object('n', count(*), 'excesso', round(coalesce(sum(pago - custo), 0), 2))
                           FROM ls WHERE pago - custo > 0.01),
      'bp_sem_transacao', (SELECT jsonb_build_object('n', count(*), 'total', round(coalesce(sum(a_pagar), 0), 2),
                             'por_rever_n', count(*) FILTER (WHERE bucket = 'por_rever'))
                           FROM ls WHERE n_tx = 0 AND a_pagar > 0.005)),
    'posicao', (SELECT jsonb_build_object(
      'caixa', round(caixa, 2), 'cartoes', round(cartoes, 2),
      'caixa_e_cartoes', round(coalesce(caixa, 0) + coalesce(cartoes, 0), 2),
      'retido_visiveis', round(retido_vis, 2),
      'a_pagar', round(a_pagar + trans_pagar, 2),
      'a_receber', round(a_receber + trans_receber, 2),
      'nota', 'Lado a lado; caixa e retido não somam (D-ERP27).') FROM tot)
  ) INTO v_out;

  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;
