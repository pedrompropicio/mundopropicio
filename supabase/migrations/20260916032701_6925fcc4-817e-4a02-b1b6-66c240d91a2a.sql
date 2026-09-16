-- D-ERP69, regra 5: a conta corrente de um circuito de terceiros acaba a zero.
-- Blocker HARD novo em event_close_blockers: 'circuit_accounts'.
-- Posicao calculada por public._account_true_balance_raw (formula unica do sistema), tolerancia 0,01.
CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT e.id, e.parent_event_id
    FROM public.events e
    WHERE e.id = _event_id
  ),
  scope_ids AS (
    SELECT _event_id AS id
    UNION
    SELECT s.parent_event_id FROM scope s WHERE s.parent_event_id IS NOT NULL
    UNION
    SELECT e2.id
    FROM public.events e2, scope s
    WHERE e2.parent_event_id = COALESCE(s.parent_event_id, _event_id)
  ),
  circuit_accounts AS (
    SELECT DISTINCT fa.id, fa.name, COALESCE(fa.skip_balance_check, false) AS skip_balance_check
    FROM public.transactions t
    JOIN public.financial_accounts fa ON fa.id = t.shared_cost_account_id
    WHERE t.shared_cost_account_id IS NOT NULL
      AND COALESCE(fa.is_circuit_account, false) = true
      AND t.event_id IN (SELECT id FROM scope_ids)
  ),
  circuit_positions AS (
    SELECT ca.id,
           ca.name,
           ca.skip_balance_check,
           CASE WHEN ca.skip_balance_check THEN NULL
                ELSE public._account_true_balance_raw(ca.id) END AS position
    FROM circuit_accounts ca
  )
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.is_platform_admin(auth.uid())
      OR (SELECT e.company_id FROM public.events e WHERE e.id = _event_id) = public.current_company_id()
    ) THEN NULL::jsonb
  ELSE jsonb_build_object(
    'hard', jsonb_build_object(
      'camarim_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', cs.id, 'title', cs.title, 'status', cs.status) ORDER BY cs.title)
        FROM public.camarim_sessions cs
        WHERE cs.status <> 'integrated'
          AND (
            cs.master_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.camarim_session_events cse
              WHERE cse.session_id = cs.id AND cse.event_id = _event_id
            )
          )
      ), '[]'::jsonb),
      'card_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', s.id,
                 'holder_name', s.holder_name,
                 'card_name', fa.name,
                 'status', s.status
               ) ORDER BY s.opened_at)
        FROM public.card_sessions s
        LEFT JOIN public.financial_accounts fa ON fa.id = s.card_account_id
        WHERE s.status <> 'closed'
          AND (
            s.primary_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.card_session_items i
              WHERE i.session_id = s.id AND i.event_id = _event_id
                AND i.status IN ('submitted','approved')
            )
            OR EXISTS (
              SELECT 1 FROM public.transactions t
              WHERE t.card_session_id = s.id AND t.event_id = _event_id
            )
          )
      ), '[]'::jsonb),
      'circuit_accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', cp.id,
                 'name', cp.name,
                 'position', ROUND(cp.position, 2),
                 'skip_balance_check', cp.skip_balance_check,
                 'message', CASE
                   WHEN cp.skip_balance_check THEN
                     'A conta de circuito "' || cp.name || '" esta com "Ignorar controlo de saldo" ligado: a posicao do circuito nao pode ser verificada. Desliga a opcao nas Contas de Movimentacao e confirma que a posicao esta a zero antes de fechar.'
                   ELSE
                     'A conta de circuito "' || cp.name || '" tem posicao de ' || to_char(ROUND(cp.position, 2), 'FM999999999D00') || ' EUR em vez de zero. Falta lancar o custo da MP por rubrica pago por esta conta, registar a devolucao do terceiro, ou apurar a quota da MP.'
                 END
               ) ORDER BY cp.name)
        FROM circuit_positions cp
        WHERE cp.skip_balance_check
           OR ABS(COALESCE(cp.position, 0)) > 0.01
      ), '[]'::jsonb)
    ),
    'soft', jsonb_build_object(
      'pending_expenses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'description', t.description,
                 'amount', t.amount,
                 'status', t.status,
                 'supplier_name', sup.name,
                 'due_date', t.due_date
               ) ORDER BY t.due_date NULLS LAST, t.amount DESC)
        FROM public.transactions t
        LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
        WHERE t.event_id = _event_id
          AND t.type = 'expense'
          AND t.status IN ('pending','overdue')
          AND t.reversed_at IS NULL
      ), '[]'::jsonb)
    )
  ) END;
$function$;

REVOKE EXECUTE ON FUNCTION public.event_close_blockers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.event_close_blockers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role;