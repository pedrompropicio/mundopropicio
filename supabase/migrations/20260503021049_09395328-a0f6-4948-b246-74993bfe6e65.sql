
-- ============================================================
-- Bilheteira: tipo de lote (Simples/Combo) + cortesias por dia/zona/cenário
-- ============================================================

-- 1) lot_kind em event_ticket_lots
ALTER TABLE public.event_ticket_lots
  ADD COLUMN IF NOT EXISTS lot_kind text NOT NULL DEFAULT 'simple';

ALTER TABLE public.event_ticket_lots
  DROP CONSTRAINT IF EXISTS event_ticket_lots_lot_kind_check;

ALTER TABLE public.event_ticket_lots
  ADD CONSTRAINT event_ticket_lots_lot_kind_check
  CHECK (lot_kind IN ('simple','combo'));

-- Backfill: tudo o que já tem applies_to_days > 1 é combo
UPDATE public.event_ticket_lots
   SET lot_kind = 'combo'
 WHERE applies_to_days IS NOT NULL
   AND applies_to_days > 1
   AND lot_kind = 'simple';

-- Garantir coerência: combo => applies_to_days >= 2; simple => applies_to_days = 1
CREATE OR REPLACE FUNCTION public.sync_lot_kind_applies_to_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lot_kind = 'simple' THEN
    NEW.applies_to_days := 1;
  ELSIF NEW.lot_kind = 'combo' THEN
    IF NEW.applies_to_days IS NULL OR NEW.applies_to_days < 2 THEN
      NEW.applies_to_days := 2;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lot_kind_applies_to_days ON public.event_ticket_lots;
CREATE TRIGGER trg_sync_lot_kind_applies_to_days
  BEFORE INSERT OR UPDATE OF lot_kind, applies_to_days ON public.event_ticket_lots
  FOR EACH ROW EXECUTE FUNCTION public.sync_lot_kind_applies_to_days();

-- ============================================================
-- 2) Tabela event_courtesies (cortesias por dia × zona × cenário)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_courtesies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_date_id   uuid NOT NULL REFERENCES public.event_dates(id) ON DELETE CASCADE,
  zone_id         uuid NOT NULL REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE,
  scenario        text NOT NULL DEFAULT 'real',
  quantity        integer NOT NULL DEFAULT 0,
  notes           text,
  company_id      uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_courtesies_scenario_check CHECK (scenario IN ('real','breakeven','forecast')),
  CONSTRAINT event_courtesies_quantity_nonneg CHECK (quantity >= 0),
  CONSTRAINT event_courtesies_unique UNIQUE (event_date_id, zone_id, scenario)
);

CREATE INDEX IF NOT EXISTS idx_event_courtesies_event ON public.event_courtesies(event_id);
CREATE INDEX IF NOT EXISTS idx_event_courtesies_company ON public.event_courtesies(company_id);
CREATE INDEX IF NOT EXISTS idx_event_courtesies_zone ON public.event_courtesies(zone_id);

ALTER TABLE public.event_courtesies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_event_courtesies_set_company
  BEFORE INSERT ON public.event_courtesies
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE TRIGGER trg_event_courtesies_updated_at
  BEFORE UPDATE ON public.event_courtesies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: leitura para autenticados; escrita para admin/manager/editor; isolamento por empresa
CREATE POLICY "Courtesies viewable by authenticated"
  ON public.event_courtesies FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Courtesies insertable by privileged"
  ON public.event_courtesies FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'editor'::app_role)
  );

CREATE POLICY "Courtesies updatable by privileged"
  ON public.event_courtesies FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'editor'::app_role)
  );

CREATE POLICY "Courtesies deletable by admin/manager"
  ON public.event_courtesies FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
  );

CREATE POLICY company_isolation_event_courtesies
  ON public.event_courtesies AS RESTRICTIVE
  TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
