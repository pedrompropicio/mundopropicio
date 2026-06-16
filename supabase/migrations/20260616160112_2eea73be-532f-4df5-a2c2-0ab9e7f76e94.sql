
-- ============================================================================
-- Fase 2a — Partner RLS isolation + can_edit_bp + BP audit
-- ============================================================================

-- 1) Coluna can_edit_bp
ALTER TABLE public.partner_event_access
  ADD COLUMN IF NOT EXISTS can_edit_bp boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 2) Policies SELECT partner (PERMISSIVE aditivas; usam user_has_event_access)
-- ============================================================================

-- events: acesso ao próprio + acesso via Master (parent_event_id)
DROP POLICY IF EXISTS events_select_partner ON public.events;
CREATE POLICY events_select_partner ON public.events
  FOR SELECT TO authenticated
  USING (
    public.user_has_event_access(auth.uid(), id)
    OR (parent_event_id IS NOT NULL AND public.user_has_event_access(auth.uid(), parent_event_id))
  );

-- event_sessions
DROP POLICY IF EXISTS event_sessions_select_partner ON public.event_sessions;
CREATE POLICY event_sessions_select_partner ON public.event_sessions
  FOR SELECT TO authenticated
  USING (public.user_has_event_access(auth.uid(), event_id));

-- event_ticket_zones
DROP POLICY IF EXISTS event_ticket_zones_select_partner ON public.event_ticket_zones;
CREATE POLICY event_ticket_zones_select_partner ON public.event_ticket_zones
  FOR SELECT TO authenticated
  USING (public.user_has_event_access(auth.uid(), event_id));

-- event_ticket_lots (via zone)
DROP POLICY IF EXISTS event_ticket_lots_select_partner ON public.event_ticket_lots;
CREATE POLICY event_ticket_lots_select_partner ON public.event_ticket_lots
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_ticket_zones z
    WHERE z.id = event_ticket_lots.zone_id
      AND public.user_has_event_access(auth.uid(), z.event_id)
  ));

-- ticket_sales (via zone)
DROP POLICY IF EXISTS ticket_sales_select_partner ON public.ticket_sales;
CREATE POLICY ticket_sales_select_partner ON public.ticket_sales
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_ticket_zones z
    WHERE z.id = ticket_sales.zone_id
      AND public.user_has_event_access(auth.uid(), z.event_id)
  ));

-- event_forecasts
DROP POLICY IF EXISTS event_forecasts_select_partner ON public.event_forecasts;
CREATE POLICY event_forecasts_select_partner ON public.event_forecasts
  FOR SELECT TO authenticated
  USING (public.user_has_event_access(auth.uid(), event_id));

-- transactions
DROP POLICY IF EXISTS transactions_select_partner ON public.transactions;
CREATE POLICY transactions_select_partner ON public.transactions
  FOR SELECT TO authenticated
  USING (event_id IS NOT NULL AND public.user_has_event_access(auth.uid(), event_id));

-- transaction_documents (via transaction.event_id)
DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;
CREATE POLICY transaction_documents_select_partner ON public.transaction_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_documents.transaction_id
      AND t.event_id IS NOT NULL
      AND public.user_has_event_access(auth.uid(), t.event_id)
  ));

-- event_partners: só a linha do próprio sócio (via supplier_id = user_supplier_id)
DROP POLICY IF EXISTS event_partners_select_partner ON public.event_partners;
CREATE POLICY event_partners_select_partner ON public.event_partners
  FOR SELECT TO authenticated
  USING (
    public.user_has_event_access(auth.uid(), event_id)
    AND supplier_id IS NOT NULL
    AND supplier_id = public.user_supplier_id(auth.uid())
  );

-- event_partner_extras: filtrado via partner_id → event_partners do próprio
DROP POLICY IF EXISTS event_partner_extras_select_partner ON public.event_partner_extras;
CREATE POLICY event_partner_extras_select_partner ON public.event_partner_extras
  FOR SELECT TO authenticated
  USING (
    public.user_has_event_access(auth.uid(), event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_partners ep
      WHERE ep.id = event_partner_extras.partner_id
        AND ep.supplier_id = public.user_supplier_id(auth.uid())
    )
  );

-- partner_paid_expenses: filtrado via partner_id
DROP POLICY IF EXISTS partner_paid_expenses_select_partner ON public.partner_paid_expenses;
CREATE POLICY partner_paid_expenses_select_partner ON public.partner_paid_expenses
  FOR SELECT TO authenticated
  USING (
    public.user_has_event_access(auth.uid(), event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_partners ep
      WHERE ep.id = partner_paid_expenses.partner_id
        AND ep.supplier_id = public.user_supplier_id(auth.uid())
    )
  );

-- partner_advance_expenses: filtrado via partner_id
DROP POLICY IF EXISTS partner_advance_expenses_select_partner ON public.partner_advance_expenses;
CREATE POLICY partner_advance_expenses_select_partner ON public.partner_advance_expenses
  FOR SELECT TO authenticated
  USING (
    public.user_has_event_access(auth.uid(), event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_partners ep
      WHERE ep.id = partner_advance_expenses.partner_id
        AND ep.supplier_id = public.user_supplier_id(auth.uid())
    )
  );

-- ============================================================================
-- 3) UPDATE condicional em event_forecasts para parceiro com can_edit_bp
-- ============================================================================
DROP POLICY IF EXISTS event_forecasts_update_partner ON public.event_forecasts;
CREATE POLICY event_forecasts_update_partner ON public.event_forecasts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = auth.uid()
        AND pea.event_id = event_forecasts.event_id
        AND pea.is_active = true
        AND pea.can_edit_bp = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = auth.uid()
        AND pea.event_id = event_forecasts.event_id
        AND pea.is_active = true
        AND pea.can_edit_bp = true
    )
    AND company_id = public.current_company_id()
  );

-- ============================================================================
-- 4) Trigger de audit genérico em event_forecasts
-- ============================================================================
DROP TRIGGER IF EXISTS audit_event_forecasts_changes ON public.event_forecasts;
CREATE TRIGGER audit_event_forecasts_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

-- ============================================================================
-- 5) RPC batch_update_event_forecasts: aceitar partner com can_edit_bp
-- ============================================================================
CREATE OR REPLACE FUNCTION public.batch_update_event_forecasts(
  _event_id uuid,
  _version_id uuid DEFAULT NULL::uuid,
  _edits jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_caller uuid := auth.uid();
  v_can_edit boolean;
  v_is_partner_editor boolean;
  v_edit jsonb;
  v_id uuid;
  v_row record;
  v_cat record;
  v_iva int;
  v_amount numeric;
  v_formalidade text;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
  v_allowed_event_ids uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM events WHERE id = _event_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Event % not found', _event_id USING ERRCODE = 'P0002';
  END IF;

  v_can_edit := public.is_platform_admin()
             OR public.has_role(v_caller, 'admin'::app_role)
             OR public.has_role(v_caller, 'manager'::app_role);

  -- Partner com can_edit_bp para este evento (ou Master) também pode editar valores
  IF NOT v_can_edit THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_caller
        AND pea.is_active = true
        AND pea.can_edit_bp = true
        AND (
          pea.event_id = _event_id
          OR pea.event_id IN (SELECT id FROM events WHERE parent_event_id = _event_id)
          OR _event_id IN (SELECT id FROM events WHERE parent_event_id = pea.event_id)
        )
    ) INTO v_is_partner_editor;
    v_can_edit := v_is_partner_editor;
  END IF;

  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Insufficient permission to edit BP' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_allowed_event_ids
  FROM events
  WHERE id = _event_id OR parent_event_id = _event_id;

  IF jsonb_array_length(_edits) = 0 THEN
    RETURN jsonb_build_object('updated', 0, 'results', '[]'::jsonb);
  END IF;

  FOR v_edit IN SELECT * FROM jsonb_array_elements(_edits) LOOP
    v_id := (v_edit->>'id')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Missing id in edits payload';
    END IF;

    SELECT f.*, ac.type AS cat_type
    INTO v_row
    FROM event_forecasts f
    LEFT JOIN account_categories ac ON ac.id = f.category_id
    WHERE f.id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forecast % not found', v_id USING ERRCODE = 'P0002';
    END IF;

    IF v_row.company_id <> v_company_id THEN
      RAISE EXCEPTION 'Forecast % belongs to another company', v_id USING ERRCODE = '42501';
    END IF;
    IF NOT (v_row.event_id = ANY(v_allowed_event_ids)) THEN
      RAISE EXCEPTION 'Forecast % not in scope of event %', v_id, _event_id USING ERRCODE = '42501';
    END IF;
    IF v_row.version_id IS DISTINCT FROM _version_id THEN
      RAISE EXCEPTION 'Forecast % belongs to a different BP version', v_id USING ERRCODE = '42501';
    END IF;

    IF v_row.is_overhead OR v_row.exclude_from_result THEN
      RAISE EXCEPTION 'Forecast % is an overhead/excluded row and is read-only here', v_id USING ERRCODE = '42501';
    END IF;
    IF v_row.master_forecast_id IS NOT NULL THEN
      RAISE EXCEPTION 'Forecast % is adopted from the Master BP and read-only here', v_id USING ERRCODE = '42501';
    END IF;
    IF v_row.is_retroactive_override THEN
      RAISE EXCEPTION 'Forecast % is a retroactive override and read-only', v_id USING ERRCODE = '42501';
    END IF;

    IF v_edit ? 'category_id' THEN
      IF v_edit->>'category_id' IS NULL OR v_edit->>'category_id' = '' THEN
        IF v_row.category_id IS NOT NULL THEN
          RAISE EXCEPTION 'Row %: category_id is required', v_id USING ERRCODE = '23502';
        END IF;
      ELSE
        SELECT ac.id, ac.type, ac.is_active,
               (SELECT COUNT(*) FROM account_categories c WHERE c.parent_id = ac.id) AS children
        INTO v_cat
        FROM account_categories ac
        WHERE ac.id = (v_edit->>'category_id')::uuid;

        IF v_cat IS NULL THEN
          RAISE EXCEPTION 'Row %: category not found', v_id USING ERRCODE = '23503';
        END IF;
        IF NOT v_cat.is_active THEN
          RAISE EXCEPTION 'Row %: category is inactive', v_id USING ERRCODE = '23514';
        END IF;
        IF v_cat.children > 0 THEN
          RAISE EXCEPTION 'Row %: only L3 (leaf) categories are selectable', v_id USING ERRCODE = '23514';
        END IF;
        IF v_cat.type <> v_row.type THEN
          RAISE EXCEPTION 'Row %: category type % does not match row type %', v_id, v_cat.type, v_row.type USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    IF v_edit ? 'iva_rate' THEN
      v_iva := (v_edit->>'iva_rate')::int;
      IF v_iva NOT IN (0, 6, 13, 23) THEN
        RAISE EXCEPTION 'Row %: iva_rate must be 0/6/13/23', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_edit ? 'amount' THEN
      v_amount := (v_edit->>'amount')::numeric;
      IF v_amount < 0 THEN
        RAISE EXCEPTION 'Row %: amount must be >= 0', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_edit ? 'formalidade' THEN
      v_formalidade := v_edit->>'formalidade';
      IF v_formalidade NOT IN ('estimado','negociacao','fechado','pago_parcial','pago_total') THEN
        RAISE EXCEPTION 'Row %: invalid formalidade %', v_id, v_formalidade USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE event_forecasts SET
      description     = CASE WHEN v_edit ? 'description'   THEN v_edit->>'description' ELSE description END,
      category_id     = CASE WHEN v_edit ? 'category_id'   THEN NULLIF(v_edit->>'category_id','')::uuid ELSE category_id END,
      iva_rate        = CASE WHEN v_edit ? 'iva_rate'      THEN (v_edit->>'iva_rate')::int ELSE iva_rate END,
      amount          = CASE WHEN v_edit ? 'amount'        THEN (v_edit->>'amount')::numeric ELSE amount END,
      notes           = CASE WHEN v_edit ? 'notes'         THEN NULLIF(v_edit->>'notes','') ELSE notes END,
      specification   = CASE WHEN v_edit ? 'specification' THEN NULLIF(v_edit->>'specification','') ELSE specification END,
      formalidade     = CASE WHEN v_edit ? 'formalidade'   THEN (v_edit->>'formalidade')::formalidade_status ELSE formalidade END,
      formalidade_changed_at = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::formalidade_status IS DISTINCT FROM formalidade THEN now() ELSE formalidade_changed_at END,
      formalidade_changed_by = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::formalidade_status IS DISTINCT FROM formalidade THEN v_caller ELSE formalidade_changed_by END,
      updated_at = now()
    WHERE id = v_id;

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);
  END LOOP;

  RETURN jsonb_build_object('updated', v_count, 'results', v_results);
END;
$function$;
