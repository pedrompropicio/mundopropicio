-- Persistent storage for orphan BP attachment links (XLSX import leftovers)
CREATE TABLE public.bp_orphan_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  row_description TEXT NOT NULL,
  row_base_amount NUMERIC NOT NULL DEFAULT 0,
  link_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | resolved | ignored
  resolved_forecast_ids UUID[] NOT NULL DEFAULT '{}',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, link_url, row_description)
);

CREATE INDEX idx_bp_orphan_attachments_event ON public.bp_orphan_attachments(event_id, status);

ALTER TABLE public.bp_orphan_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orphan attachments viewable by authenticated"
  ON public.bp_orphan_attachments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Orphan attachments insertable by admin or manager"
  ON public.bp_orphan_attachments FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Orphan attachments updatable by admin or manager"
  ON public.bp_orphan_attachments FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Orphan attachments deletable by admin or manager"
  ON public.bp_orphan_attachments FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_bp_orphan_attachments_updated_at
  BEFORE UPDATE ON public.bp_orphan_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();