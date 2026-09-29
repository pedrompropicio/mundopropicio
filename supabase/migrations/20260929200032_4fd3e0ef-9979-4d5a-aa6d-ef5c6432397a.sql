ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formula_params jsonb NULL;
COMMENT ON COLUMN public.event_forecasts.formula_params IS '#263 D-ERP149: parâmetros das linhas com fórmula (pct_ticket_revenue | per_head).';

ALTER TABLE public.event_courtesies ADD COLUMN IF NOT EXISTS updated_by uuid NULL DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.event_courtesies_set_updated_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.event_courtesies_set_updated_by() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_event_courtesies_updated_by ON public.event_courtesies;
CREATE TRIGGER trg_event_courtesies_updated_by BEFORE UPDATE ON public.event_courtesies
FOR EACH ROW EXECUTE FUNCTION public.event_courtesies_set_updated_by();

DROP TRIGGER IF EXISTS audit_event_courtesies_changes ON public.event_courtesies;
CREATE TRIGGER audit_event_courtesies_changes AFTER INSERT OR DELETE OR UPDATE ON public.event_courtesies
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();