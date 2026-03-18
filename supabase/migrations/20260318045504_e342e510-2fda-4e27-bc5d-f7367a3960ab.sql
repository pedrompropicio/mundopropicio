
-- Add event_type to events table
ALTER TABLE public.events ADD COLUMN event_type text NOT NULL DEFAULT 'simple';

-- Add parent_event_id for multi-day sub-events
ALTER TABLE public.events ADD COLUMN parent_event_id uuid REFERENCES public.events(id) ON DELETE CASCADE DEFAULT NULL;

-- Table for festival non-consecutive dates
CREATE TABLE public.event_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event dates viewable by authenticated" ON public.event_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Event dates manageable by authenticated" ON public.event_dates FOR ALL TO authenticated USING (true) WITH CHECK (true);
