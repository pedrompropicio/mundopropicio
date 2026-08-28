CREATE OR REPLACE FUNCTION public.sync_forecast_anchor_to_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Ignorar snapshots de versões/cenários
  IF NEW.version_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Âncora removida: NÃO limpar forecast_id (modelo N transações -> 1 linha)
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;

  SELECT forecast_id INTO v_existing
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_existing IS NULL THEN
    UPDATE public.transactions SET forecast_id = NEW.id WHERE id = NEW.transaction_id;
  ELSIF v_existing = NEW.id THEN
    NULL; -- já coerente (idempotente)
  ELSE
    RAISE EXCEPTION 'Incoerência de vínculo BP↔transação: a transação % já está vinculada à linha de BP % e não pode ser usada como âncora da linha %. Desvincule-a primeiro.',
      NEW.transaction_id, v_existing, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_tx_forecast_to_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor uuid;
  v_next uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NEW.forecast_id IS NOT NULL THEN
    SELECT transaction_id INTO v_anchor
    FROM public.event_forecasts
    WHERE id = NEW.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor IS NULL THEN
      UPDATE public.event_forecasts
      SET transaction_id = NEW.id
      WHERE id = NEW.forecast_id AND transaction_id IS NULL AND version_id IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- forecast_id passou a NULL: repor âncora se era esta transação
  IF TG_OP = 'UPDATE' AND OLD.forecast_id IS NOT NULL THEN
    SELECT transaction_id INTO v_anchor
    FROM public.event_forecasts
    WHERE id = OLD.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor = NEW.id THEN
      SELECT id INTO v_next
      FROM public.transactions
      WHERE forecast_id = OLD.forecast_id AND id <> NEW.id
      ORDER BY date, created_at, id
      LIMIT 1;

      UPDATE public.event_forecasts
      SET transaction_id = v_next
      WHERE id = OLD.forecast_id AND version_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_forecast_anchor_to_tx
AFTER INSERT OR UPDATE OF transaction_id ON public.event_forecasts
FOR EACH ROW EXECUTE FUNCTION public.sync_forecast_anchor_to_tx();

CREATE TRIGGER trg_sync_tx_forecast_to_anchor
AFTER INSERT OR UPDATE OF forecast_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_tx_forecast_to_anchor();