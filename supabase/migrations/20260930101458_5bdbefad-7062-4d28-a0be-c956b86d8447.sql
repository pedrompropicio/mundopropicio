-- #264 — Janela administrativa: de absorção virtual no DRE a trava real na base.
-- Decisões do Pedro (30/09/2026): data de referência = transactions.date; contas
-- 10.1/10.2/10.3/10.12 nunca marcáveis; excepção por permissão configurável
-- (admin_cost_override, admin+manager por defeito); janelas contíguas sem buraco.
-- Resoluções: sem isenção para sync do Coala nem restauros; filhas de rateio e
-- parcelas (parent_transaction_id) isentas — a regra aplica-se à mãe.

-- ───────────── A. Contas bloqueadas ─────────────
CREATE OR REPLACE FUNCTION public.validate_category_allocate_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.allocate_to_active_event = true THEN
    IF NEW.code !~ '^10\.[0-9]+\.[0-9]+$' THEN
      RAISE EXCEPTION 'allocate_to_active_event só pode ser ligado em categorias de Nível 3 do Grupo 10 (formato 10.x.yy). Código atual: %', NEW.code;
    END IF;
    IF NEW.code ~ '^10\.(1|2|3|12)\.' THEN
      RAISE EXCEPTION 'A conta % não pode ser custo do evento da janela administrativa: 10.1, 10.2, 10.3 e 10.12 ficam sempre na empresa.', NEW.code;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.account_categories
   SET allocate_to_active_event = false
 WHERE company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
   AND code IN ('10.1.01','10.1.02','10.1.03')
   AND allocate_to_active_event = true;

-- ───────────── B. Janelas ─────────────
CREATE OR REPLACE FUNCTION public.admin_window_event_for(p_company_id uuid, p_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id
    FROM public.events e
   WHERE e.company_id = p_company_id
     AND e.absorbs_admin_costs = true
     AND e.parent_event_id IS NULL
     AND e.admin_window_start IS NOT NULL
     AND p_date >= e.admin_window_start
     AND (e.admin_window_end IS NULL OR p_date <= e.admin_window_end)
   ORDER BY e.admin_window_start DESC
   LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_window_event_for(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_window_event_for(uuid, date) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_window_event_for(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.find_admin_absorbing_events(p_date date, p_company_id uuid)
 RETURNS TABLE(event_id uuid, event_name text, event_date date, admin_window_start date, admin_window_end date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.date, e.admin_window_start, e.admin_window_end
    FROM public.events e
   WHERE e.absorbs_admin_costs = true
     AND e.company_id = p_company_id
     AND e.parent_event_id IS NULL
     AND e.status IN ('confirmed', 'active', 'completed')
     AND p_date >= e.admin_window_start
     AND (e.admin_window_end IS NULL OR p_date <= e.admin_window_end)
   ORDER BY ABS(e.date - p_date) ASC;
$function$;

CREATE OR REPLACE FUNCTION public.validate_event_admin_absorption()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_open_id uuid;
BEGIN
  IF NEW.absorbs_admin_costs = true THEN
    IF NEW.parent_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas eventos Master ou Single podem absorver custos administrativos (não Splits).';
    END IF;
    IF NEW.admin_window_start IS NULL THEN
      RAISE EXCEPTION 'Quando o evento absorve custos administrativos, a data de início da janela é obrigatória.';
    END IF;
    IF NEW.admin_window_end IS NOT NULL AND NEW.admin_window_end < NEW.admin_window_start THEN
      RAISE EXCEPTION 'O fim da janela (%) não pode ser anterior ao início (%).',
        to_char(NEW.admin_window_end,'DD/MM/YYYY'), to_char(NEW.admin_window_start,'DD/MM/YYYY');
    END IF;

    -- Janela em aberto de outro evento que começa antes: fecha no dia antes.
    IF coalesce(current_setting('mp.admin_window_autoclose', true), '') <> 'on' THEN
      SELECT id INTO v_open_id
        FROM public.events
       WHERE company_id = NEW.company_id
         AND id <> NEW.id
         AND absorbs_admin_costs = true
         AND parent_event_id IS NULL
         AND admin_window_end IS NULL
         AND admin_window_start < NEW.admin_window_start
       ORDER BY admin_window_start DESC
       LIMIT 1;
      IF v_open_id IS NOT NULL THEN
        PERFORM set_config('mp.admin_window_autoclose', 'on', true);
        UPDATE public.events
           SET admin_window_end = NEW.admin_window_start - 1
         WHERE id = v_open_id;
        PERFORM set_config('mp.admin_window_autoclose', '', true);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_admin_windows_contiguous(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  p_name text; p_s date; p_e date;
  first boolean := true;
BEGIN
  FOR r IN
    SELECT id, name, admin_window_start AS s, admin_window_end AS e
      FROM public.events
     WHERE company_id = p_company_id
       AND absorbs_admin_costs = true
       AND parent_event_id IS NULL
     ORDER BY admin_window_start, id
  LOOP
    IF NOT first THEN
      IF p_e IS NULL THEN
        RAISE EXCEPTION 'Janelas administrativas: "%" (desde %) está em aberto, mas "%" começa depois (%). Só a última janela pode ficar em aberto.',
          p_name, to_char(p_s,'DD/MM/YYYY'), r.name, to_char(r.s,'DD/MM/YYYY');
      ELSIF r.s <= p_e THEN
        RAISE EXCEPTION 'Janelas administrativas sobrepostas: "%" (% a %) e "%" (desde %).',
          p_name, to_char(p_s,'DD/MM/YYYY'), to_char(p_e,'DD/MM/YYYY'), r.name, to_char(r.s,'DD/MM/YYYY');
      ELSIF r.s > p_e + 1 THEN
        RAISE EXCEPTION 'Janelas administrativas com buraco: "%" termina a % e "%" começa a %. O início tem de ser o dia seguinte ao fim da anterior (%).',
          p_name, to_char(p_e,'DD/MM/YYYY'), r.name, to_char(r.s,'DD/MM/YYYY'), to_char(p_e + 1,'DD/MM/YYYY');
      END IF;
    END IF;
    p_name := r.name; p_s := r.s; p_e := r.e;
    first := false;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_admin_windows_contiguous(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_admin_windows_contiguous(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_admin_windows_contiguous(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_check_admin_windows_contiguous()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('mp.admin_window_autoclose', true), '') = 'on' THEN
    RETURN NULL; -- fecho automático: a escrita exterior valida
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.absorbs_admin_costs THEN PERFORM public.check_admin_windows_contiguous(OLD.company_id); END IF;
    RETURN NULL;
  END IF;
  IF NEW.absorbs_admin_costs OR (TG_OP = 'UPDATE' AND OLD.absorbs_admin_costs) THEN
    PERFORM public.check_admin_windows_contiguous(NEW.company_id);
    IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.absorbs_admin_costs THEN
      PERFORM public.check_admin_windows_contiguous(OLD.company_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_check_admin_windows_contiguous() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_check_admin_windows_contiguous() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trg_check_admin_windows_contiguous() TO service_role;

DROP TRIGGER IF EXISTS trg_admin_windows_contiguous ON public.events;
CREATE TRIGGER trg_admin_windows_contiguous
  AFTER INSERT OR DELETE OR UPDATE OF absorbs_admin_costs, admin_window_start, admin_window_end, parent_event_id, company_id
  ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_admin_windows_contiguous();

-- ───────────── C. Trava em transactions ─────────────
INSERT INTO public.role_permissions (role, permission)
SELECT r::public.app_role, 'admin_cost_override'
  FROM unnest(ARRAY['admin','manager']) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role = r::public.app_role AND rp.permission = 'admin_cost_override');

CREATE OR REPLACE FUNCTION public.enforce_admin_window_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag boolean;
  v_code text;
  v_window uuid;
  v_window_name text;
  v_chosen_name text;
  v_uid uuid := auth.uid();
  v_reason text;
BEGIN
  -- Filhas de rateio e parcelas: a obrigação é da mãe (como D1/D8).
  IF NEW.parent_transaction_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NEW.date IS NULL OR NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- UPDATE sem mudança real das chaves: nunca toca histórico.
  IF TG_OP = 'UPDATE'
     AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  SELECT allocate_to_active_event, code INTO v_flag, v_code
    FROM public.account_categories WHERE id = NEW.category_id;
  IF NOT coalesce(v_flag, false) THEN RETURN NEW; END IF;

  v_window := public.admin_window_event_for(NEW.company_id, NEW.date);
  IF v_window IS NULL OR NEW.event_id IS NOT DISTINCT FROM v_window THEN RETURN NEW; END IF;

  SELECT name INTO v_window_name FROM public.events WHERE id = v_window;
  SELECT name INTO v_chosen_name FROM public.events WHERE id = NEW.event_id;

  v_reason := nullif(btrim(coalesce(current_setting('mp.admin_cost_override_reason', true), '')), '');

  IF v_uid IS NULL OR v_reason IS NULL
     OR NOT public.has_permission_in(v_uid, 'admin_cost_override', NEW.company_id) THEN
    RAISE EXCEPTION 'Esta conta é custo do evento % nesta data. Escolhe esse evento ou pede a excepção.', v_window_name
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, company_id, new_data, metadata)
  VALUES ('transaction', NEW.id::text, 'admin_cost_override',
          coalesce(auth.jwt() ->> 'email', v_uid::text), NEW.company_id,
          jsonb_build_object('event_id', NEW.event_id, 'category_code', v_code, 'date', NEW.date, 'type', NEW.type, 'op', TG_OP),
          jsonb_build_object(
            'evento_da_janela', jsonb_build_object('id', v_window, 'nome', v_window_name),
            'evento_escolhido', CASE WHEN NEW.event_id IS NULL THEN NULL
                                     ELSE jsonb_build_object('id', NEW.event_id, 'nome', v_chosen_name) END,
            'justificacao', v_reason));
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_admin_window_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_admin_window_event() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enforce_admin_window_event() TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_admin_window_event ON public.transactions;
CREATE TRIGGER trg_enforce_admin_window_event
  BEFORE INSERT OR UPDATE OF event_id, category_id, date, company_id, type
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_window_event();

-- Leitura para o ecrã (invoker; só devolve o evento se a RLS de events o mostrar).
CREATE OR REPLACE FUNCTION public.admin_window_event_lookup(p_company_id uuid, p_date date)
 RETURNS TABLE(event_id uuid, event_name text, admin_window_start date, admin_window_end date)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.admin_window_start, e.admin_window_end
    FROM public.events e
   WHERE e.company_id = p_company_id
     AND e.absorbs_admin_costs = true
     AND e.parent_event_id IS NULL
     AND e.admin_window_start IS NOT NULL
     AND p_date >= e.admin_window_start
     AND (e.admin_window_end IS NULL OR p_date <= e.admin_window_end)
   ORDER BY e.admin_window_start DESC
   LIMIT 1
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_window_event_lookup(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_window_event_lookup(uuid, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_window_event_lookup(uuid, date) TO authenticated, service_role;

-- RPC da excepção (padrão mp.bp_change_observation da #240). A justificação só
-- vive dentro da transacção, por isso é a RPC que faz a escrita: INSERT de uma
-- transação nova (p_transaction_id NULL, colunas de p_row) ou UPDATE das chaves
-- event_id/forecast_id/category_id/date de uma existente. SECURITY INVOKER: RLS
-- e restantes triggers aplicam-se ao utilizador.
CREATE OR REPLACE FUNCTION public.admin_cost_override_write(
  p_reason text,
  p_row jsonb,
  p_transaction_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_id uuid;
  v_cols text;
  v_rec public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(coalesce(p_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'A justificação da excepção é obrigatória.';
  END IF;

  IF p_transaction_id IS NULL THEN
    v_company := coalesce(nullif(p_row ->> 'company_id', '')::uuid, public.current_company_id());
  ELSE
    SELECT * INTO v_rec FROM public.transactions WHERE id = p_transaction_id;
    IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Transação não encontrada.'; END IF;
    v_company := v_rec.company_id;
  END IF;

  IF v_company IS NULL OR NOT public.has_permission_in(auth.uid(), 'admin_cost_override', v_company) THEN
    RAISE EXCEPTION 'Sem permissão para a excepção da janela administrativa.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('mp.admin_cost_override_reason', btrim(p_reason), true);

  IF p_transaction_id IS NULL THEN
    SELECT string_agg(quote_ident(c.column_name), ', ')
      INTO v_cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'transactions'
       AND p_row ? c.column_name
       AND c.is_generated = 'NEVER';
    IF v_cols IS NULL THEN RAISE EXCEPTION 'Dados da transação em falta.'; END IF;
    EXECUTE format(
      'INSERT INTO public.transactions (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.transactions, $1) RETURNING id',
      v_cols) INTO v_id USING p_row;
  ELSE
    UPDATE public.transactions
       SET event_id    = CASE WHEN p_row ? 'event_id'    THEN nullif(p_row->>'event_id','')::uuid    ELSE v_rec.event_id END,
           forecast_id = CASE WHEN p_row ? 'forecast_id' THEN nullif(p_row->>'forecast_id','')::uuid ELSE v_rec.forecast_id END,
           category_id = CASE WHEN p_row ? 'category_id' THEN nullif(p_row->>'category_id','')::uuid ELSE v_rec.category_id END,
           date        = CASE WHEN p_row ? 'date'        THEN (p_row->>'date')::date                 ELSE v_rec.date END
     WHERE id = p_transaction_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Sem permissão para alterar esta transação.' USING ERRCODE = '42501'; END IF;
  END IF;

  PERFORM set_config('mp.admin_cost_override_reason', '', true);
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_cost_override_write(text, jsonb, uuid) TO authenticated, service_role;
