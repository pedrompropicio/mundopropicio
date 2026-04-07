CREATE TABLE public.ticket_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ticket_office_id UUID REFERENCES public.ticket_offices(id) ON DELETE SET NULL,
  import_type TEXT NOT NULL DEFAULT 'sales',
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  file_name TEXT,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  zones_created INTEGER NOT NULL DEFAULT 0,
  lots_created INTEGER NOT NULL DEFAULT 0,
  imported_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view import logs"
  ON public.ticket_import_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can create import logs"
  ON public.ticket_import_logs FOR INSERT
  TO authenticated WITH CHECK (true);