CREATE TABLE IF NOT EXISTS public.bilheteira_zone_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  provider text,
  zone_label text NOT NULL,
  seats_available int,
  capacity int,
  source text CHECK (source IN ('bol_map', 'ticketline_json', 'manual')),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bilheteira_zone_snapshots_event_zone_idx
  ON public.bilheteira_zone_snapshots (event_id, zone_label, captured_at DESC);

GRANT ALL ON public.bilheteira_zone_snapshots TO service_role;
GRANT SELECT ON public.bilheteira_zone_snapshots TO authenticated;

ALTER TABLE public.bilheteira_zone_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bzs_service_role_all" ON public.bilheteira_zone_snapshots;
CREATE POLICY "bzs_service_role_all"
  ON public.bilheteira_zone_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bzs_admin_select" ON public.bilheteira_zone_snapshots;
CREATE POLICY "bzs_admin_select"
  ON public.bilheteira_zone_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.event_zone_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  zone_label text NOT NULL,
  capacity int NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, zone_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_zone_capacities TO authenticated;
GRANT ALL ON public.event_zone_capacities TO service_role;

ALTER TABLE public.event_zone_capacities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ezc_admin_all" ON public.event_zone_capacities;
CREATE POLICY "ezc_admin_all"
  ON public.event_zone_capacities
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
  );

DROP POLICY IF EXISTS "ezc_service_role_all" ON public.event_zone_capacities;
CREATE POLICY "ezc_service_role_all"
  ON public.event_zone_capacities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);