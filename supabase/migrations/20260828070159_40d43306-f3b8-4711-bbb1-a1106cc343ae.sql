CREATE UNIQUE INDEX IF NOT EXISTS event_zone_capacities_daily_uniq
  ON public.event_zone_capacities (event_id, zone_label, observed_on, source);