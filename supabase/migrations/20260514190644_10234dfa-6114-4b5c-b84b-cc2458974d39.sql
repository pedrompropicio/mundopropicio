ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticketing_url text,
  ADD COLUMN IF NOT EXISTS ticketing_provider text;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ticketing_provider_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_ticketing_provider_check
  CHECK (
    ticketing_provider IS NULL
    OR ticketing_provider IN (
      'ticketline','blueticket','bol','see_tickets','fnac_tickets',
      'eventbrite','ingresse','sympla','other'
    )
  );

COMMENT ON COLUMN public.events.ticketing_url IS
  'URL da landing/checkout do evento na bilheteira. NULL = não configurado.';
COMMENT ON COLUMN public.events.ticketing_provider IS
  'ID do preset Funnel Test 360. Constraint alinhado com PROVIDERS_KNOWN.';

CREATE INDEX IF NOT EXISTS idx_events_ticketing_provider
  ON public.events (ticketing_provider)
  WHERE ticketing_provider IS NOT NULL;

ALTER TABLE crm.funnel_test_runs
  ADD COLUMN IF NOT EXISTS event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'funnel_test_runs_event_id_fkey'
      AND conrelid = 'crm.funnel_test_runs'::regclass
  ) THEN
    ALTER TABLE crm.funnel_test_runs
      ADD CONSTRAINT funnel_test_runs_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN crm.funnel_test_runs.event_id IS
  'FK ao evento da plataforma MP. NULL para runs com URL ad-hoc/manual ou pré-Fase-2.';

CREATE INDEX IF NOT EXISTS idx_funnel_runs_event_id
  ON crm.funnel_test_runs (event_id)
  WHERE event_id IS NOT NULL;