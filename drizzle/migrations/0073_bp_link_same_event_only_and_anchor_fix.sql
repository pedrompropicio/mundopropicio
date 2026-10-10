-- Decisão do Pedro (10/10/2026): transação só liga a linha de BP do MESMO evento (ou sem evento).
-- Acaba a excepção Master↔cidade (contava a dobrar no custo por evento/rubrica).
CREATE OR REPLACE FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _tx_company IS NOT NULL AND _fc_company IS NOT NULL AND _tx_company <> _fc_company THEN false
    WHEN _tx_event IS NULL THEN true
    WHEN _fc_event IS NULL THEN true
    WHEN _tx_event = _fc_event THEN true
    ELSE false
  END
$function$;
REVOKE ALL ON FUNCTION public.bp_tx_link_allowed(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Âncora: ao sair da linha A (para NULL ou directamente para B), se a âncora de A era esta
-- transação, passa para a próxima transação de A que ainda possa ser âncora (ou NULL).
CREATE OR REPLACE FUNCTION public.sync_tx_forecast_to_anchor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor uuid;
  v_next uuid;
  v_fc_event uuid;
  v_fc_company uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND OLD.forecast_id IS NOT NULL
     AND OLD.forecast_id IS DISTINCT FROM NEW.forecast_id THEN
    SELECT transaction_id, event_id, company_id INTO v_anchor, v_fc_event, v_fc_company
    FROM public.event_forecasts
    WHERE id = OLD.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor = NEW.id THEN
      SELECT t.id INTO v_next
      FROM public.transactions t
      WHERE t.forecast_id = OLD.forecast_id AND t.id <> NEW.id
        AND public.bp_tx_link_allowed(t.event_id, t.company_id, v_fc_event, v_fc_company)
      ORDER BY t.date, t.created_at, t.id
      LIMIT 1;

      UPDATE public.event_forecasts
      SET transaction_id = v_next
      WHERE id = OLD.forecast_id AND version_id IS NULL;
    END IF;
  END IF;

  IF NEW.forecast_id IS NOT NULL THEN
    SELECT transaction_id INTO v_anchor
    FROM public.event_forecasts
    WHERE id = NEW.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor IS NULL THEN
      UPDATE public.event_forecasts
      SET transaction_id = NEW.id
      WHERE id = NEW.forecast_id AND transaction_id IS NULL AND version_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_tx_forecast_to_anchor() FROM PUBLIC, anon, authenticated;