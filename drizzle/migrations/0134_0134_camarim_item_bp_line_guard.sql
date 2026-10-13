-- D-ERP264: despesas de camarim seguem as regras de BP das transações.
CREATE OR REPLACE FUNCTION public.enforce_camarim_item_bp_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_master uuid;
  v_company uuid;
  v_target uuid;
  v_fc record;
  v_mode text;
  v_ev_name text;
  v_fc_ev_name text;
BEGIN
  IF NEW.status = 'rejected' THEN RETURN NEW; END IF;

  IF NEW.bp_scope = 'mixed' THEN
    IF NEW.bp_forecast_id IS NOT NULL THEN
      RAISE EXCEPTION 'Talão misto não leva linha de BP: a linha escolhe-se em cada parte da divisão.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT s.master_event_id, s.company_id INTO v_master, v_company
    FROM public.camarim_sessions s WHERE s.id = NEW.session_id;

  -- Mesmo destino que a close-camarim-session: master_common -> Master da sessão
  -- (sem recurso ao evento local); o resto -> evento principal da sessão.
  IF NEW.bp_scope = 'master_common' THEN
    IF v_master IS NULL THEN
      RAISE EXCEPTION 'Verba "BP Master" escolhida, mas esta sessão não tem evento Master. Escolhe "BP Local (cidade)".' USING ERRCODE = '23514';
    END IF;
    v_target := v_master;
  ELSE
    v_target := COALESCE(
      (SELECT se.event_id FROM public.camarim_session_events se
        WHERE se.session_id = NEW.session_id
        ORDER BY se.is_primary DESC NULLS LAST, se.created_at LIMIT 1),
      NEW.event_id, v_master);
  END IF;
  IF v_target IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_ev_name FROM public.events WHERE id = v_target;

  IF NEW.bp_forecast_id IS NOT NULL THEN
    SELECT f.event_id, f.company_id, f.version_id, c.code INTO v_fc
      FROM public.event_forecasts f
      LEFT JOIN public.account_categories c ON c.id = f.category_id
     WHERE f.id = NEW.bp_forecast_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A linha de BP indicada não existe.' USING ERRCODE = '23514';
    END IF;
    IF v_fc.version_id IS NOT NULL THEN
      RAISE EXCEPTION 'A linha de BP pertence a uma versão/cenário. Só se usam linhas vivas do Business Plan.' USING ERRCODE = '23514';
    END IF;
    -- Mesma regra das transações (trg_enforce_tx_forecast_same_event).
    IF v_fc.event_id IS NULL OR NOT public.bp_tx_link_allowed(v_target, COALESCE(NEW.company_id, v_company), v_fc.event_id, v_fc.company_id) THEN
      SELECT name INTO v_fc_ev_name FROM public.events WHERE id = v_fc.event_id;
      RAISE EXCEPTION 'Linha de BP recusada: o item vai para o BP do evento "%" e a linha é do evento "%".',
        COALESCE(v_ev_name, '(sem evento)'), COALESCE(v_fc_ev_name, '(sem evento)') USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_fc.code, '') <> '2.6.04' THEN
      RAISE EXCEPTION 'A linha de BP tem de ser da rubrica 2.6.04 — Camarins (as despesas de camarim são integradas nessa rubrica).' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(e.budget_mode, c.default_budget_mode, 'with_bp') INTO v_mode
    FROM public.events e JOIN public.companies c ON c.id = e.company_id
   WHERE e.id = v_target;

  IF v_mode = 'with_bp' AND NOT EXISTS (
    SELECT 1 FROM public.event_forecasts f
      JOIN public.account_categories c ON c.id = f.category_id
     WHERE f.event_id = v_target AND f.version_id IS NULL AND c.code = '2.6.04'
  ) THEN
    RAISE EXCEPTION 'O BP do evento "%" não tem nenhuma linha 2.6.04 — Camarins. Cria a linha no BP desse evento (ou muda a verba do item) antes de gravar.',
      COALESCE(v_ev_name, '(sem nome)') USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_enforce_camarim_item_bp_line ON public.camarim_items;
CREATE TRIGGER trg_enforce_camarim_item_bp_line
  BEFORE INSERT OR UPDATE OF bp_forecast_id, bp_scope, event_id, session_id
  ON public.camarim_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_camarim_item_bp_line();

REVOKE ALL ON FUNCTION public.enforce_camarim_item_bp_line() FROM PUBLIC, anon, authenticated;
