ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_admin_window_required;
ALTER TABLE public.events ADD CONSTRAINT events_admin_window_required
  CHECK ((NOT absorbs_admin_costs) OR (admin_window_start IS NOT NULL AND (admin_window_end IS NULL OR admin_window_start <= admin_window_end)));