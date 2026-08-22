CREATE OR REPLACE FUNCTION public.bp_tx_link_allowed(
  _tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _tx_company IS NOT NULL AND _fc_company IS NOT NULL AND _tx_company <> _fc_company THEN false
    WHEN _tx_event IS NULL THEN true
    WHEN _fc_event IS NULL THEN true
    WHEN _tx_event = _fc_event THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.events e
       WHERE (e.id = _tx_event AND e.parent_event_id = _fc_event)
          OR (e.id = _fc_event AND e.parent_event_id = _tx_event)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_forecast_tx_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_event uuid;
  v_tx_company uuid;
  v_tx_found boolean := false;
  v_tx_ev_name text;
  v_fc_ev_name text;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.transaction_id IS NOT DISTINCT FROM NEW.transaction_id THEN RETURN NEW; END IF;
  IF NEW.version_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT t.event_id, t.company_id, true
    INTO v_tx_event, v_tx_company, v_tx_found
    FROM public.transactions t WHERE t.id = NEW.transaction_id;

  IF NOT COALESCE(v_tx_found, false) THEN RETURN NEW; END IF;

  IF public.bp_tx_link_allowed(v_tx_event, v_tx_company, NEW.event_id, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_tx_ev_name FROM public.events WHERE id = v_tx_event;
  SELECT name INTO v_fc_ev_name FROM public.events WHERE id = NEW.event_id;

  RAISE EXCEPTION 'Vínculo recusado: a transação pertence ao evento "%" e a linha do Business Plan ao evento "%". Uma linha de BP só pode ser vinculada a transações do mesmo evento (ou sem evento, no desenho master/subeventos) e da mesma empresa.',
    COALESCE(v_tx_ev_name, '(sem evento)'), COALESCE(v_fc_ev_name, '(sem evento)');
END $$;

DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_same_event ON public.event_forecasts;
CREATE TRIGGER trg_enforce_forecast_tx_same_event
BEFORE INSERT OR UPDATE OF transaction_id ON public.event_forecasts
FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_tx_same_event();

CREATE OR REPLACE FUNCTION public.unlink_forecasts_on_tx_event_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN RETURN NULL; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  FOR r IN
    SELECT f.id, f.event_id, f.company_id
      FROM public.event_forecasts f
     WHERE f.transaction_id = NEW.id
       AND f.version_id IS NULL
  LOOP
    IF public.bp_tx_link_allowed(NEW.event_id, NEW.company_id, r.event_id, r.company_id) THEN
      CONTINUE;
    END IF;

    UPDATE public.event_forecasts SET transaction_id = NULL WHERE id = r.id;

    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'auto_unlink_forecast_tx_event_change', 'sistema (trigger)',
            jsonb_build_object('forecast_transaction_id', NEW.id),
            jsonb_build_object('forecast_transaction_id', NULL),
            jsonb_build_object('forecast_id', r.id, 'old_event_id', OLD.event_id, 'new_event_id', NEW.event_id,
                               'forecast_event_id', r.event_id, 'source', 'trigger'),
            COALESCE(NEW.company_id, r.company_id));
  END LOOP;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_unlink_forecasts_on_tx_event_change ON public.transactions;
CREATE TRIGGER trg_unlink_forecasts_on_tx_event_change
AFTER UPDATE OF event_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.unlink_forecasts_on_tx_event_change();

CREATE OR REPLACE FUNCTION public.sync_tx_category_from_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_cat uuid;
  v_company uuid;
  v_tx_event uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  IF NEW.version_id IS NOT NULL THEN RETURN NULL; END IF;
  IF NEW.transaction_id IS NULL OR NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT category_id, company_id, event_id INTO v_old_cat, v_company, v_tx_event
    FROM public.transactions WHERE id = NEW.transaction_id;

  IF v_old_cat IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  IF NOT public.bp_tx_link_allowed(v_tx_event, v_company, NEW.event_id, NEW.company_id) THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.transaction_id, 'blocked_cross_event_category_sync', 'sistema (trigger)',
            jsonb_build_object('category_id', v_old_cat),
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('forecast_id', NEW.id, 'direction', 'forecast_to_tx',
                               'tx_event_id', v_tx_event, 'forecast_event_id', NEW.event_id),
            COALESCE(v_company, NEW.company_id));
    RETURN NULL;
  END IF;

  UPDATE public.transactions
     SET category_id = NEW.category_id
   WHERE id = NEW.transaction_id
     AND category_id IS DISTINCT FROM NEW.category_id;

  IF v_company IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.transaction_id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', v_old_cat),
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('forecast_id', NEW.id, 'source', 'trigger', 'direction', 'forecast_to_tx'),
            v_company);
  END IF;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.realign_tx_category_from_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forecast RECORD;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT id, category_id, event_id, company_id INTO v_forecast
    FROM public.event_forecasts
   WHERE transaction_id = NEW.id
     AND version_id IS NULL
     AND category_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_forecast.id IS NULL THEN RETURN NULL; END IF;
  IF v_forecast.category_id IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  IF NOT public.bp_tx_link_allowed(NEW.event_id, NEW.company_id, v_forecast.event_id, v_forecast.company_id) THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'blocked_cross_event_category_sync', 'sistema (trigger)',
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('category_id', v_forecast.category_id),
            jsonb_build_object('forecast_id', v_forecast.id, 'direction', 'tx_to_forecast',
                               'tx_event_id', NEW.event_id, 'forecast_event_id', v_forecast.event_id),
            COALESCE(NEW.company_id, v_forecast.company_id));
    RETURN NULL;
  END IF;

  UPDATE public.transactions
     SET category_id = v_forecast.category_id
   WHERE id = NEW.id;

  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('category_id', v_forecast.category_id),
            jsonb_build_object('forecast_id', v_forecast.id, 'source', 'trigger', 'direction', 'tx_to_forecast'),
            NEW.company_id);
  END IF;

  RETURN NULL;
END $$;