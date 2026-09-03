CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
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
  );
$$;

GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_event_close_blockers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blockers jsonb;
  v_cam jsonb;
  v_card jsonb;
  v_cam_n int;
  v_card_n int;
  v_card_list text;
  v_cam_list text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    v_blockers := public.event_close_blockers(NEW.id);
    v_cam := v_blockers -> 'hard' -> 'camarim_sessions';
    v_card := v_blockers -> 'hard' -> 'card_sessions';
    v_cam_n := jsonb_array_length(COALESCE(v_cam, '[]'::jsonb));
    v_card_n := jsonb_array_length(COALESCE(v_card, '[]'::jsonb));

    IF v_cam_n > 0 OR v_card_n > 0 THEN
      SELECT string_agg(
               COALESCE(e ->> 'holder_name', 'sem portador')
               || COALESCE(' · ' || (e ->> 'card_name'), ''), '; ')
        INTO v_card_list
        FROM jsonb_array_elements(COALESCE(v_card, '[]'::jsonb)) e;

      SELECT string_agg(COALESCE(e ->> 'title', 'sessão'), '; ')
        INTO v_cam_list
        FROM jsonb_array_elements(COALESCE(v_cam, '[]'::jsonb)) e;

      RAISE EXCEPTION
        'Não é possível fechar o evento: % sessão(ões) de cartão aberta(s)%; % sessão(ões) de camarim por integrar%.',
        v_card_n,
        CASE WHEN v_card_n > 0 THEN ' (' || v_card_list || ')' ELSE '' END,
        v_cam_n,
        CASE WHEN v_cam_n > 0 THEN ' (' || v_cam_list || ')' ELSE '' END
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_event_close_blockers ON public.events;
CREATE TRIGGER enforce_event_close_blockers
BEFORE UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_close_blockers();