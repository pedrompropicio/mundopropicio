
-- Table for partner extra expenses (deducted from individual partner's share)
CREATE TABLE public.event_partner_extras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_partner_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner extras viewable by authenticated"
  ON public.event_partner_extras FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Partner extras insertable by admin or manager"
  ON public.event_partner_extras FOR INSERT
  TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Partner extras updatable by admin or manager"
  ON public.event_partner_extras FOR UPDATE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Partner extras deletable by admin or manager"
  ON public.event_partner_extras FOR DELETE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER update_event_partner_extras_updated_at
  BEFORE UPDATE ON public.event_partner_extras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for partner extra documents
INSERT INTO storage.buckets (id, name, public) VALUES ('partner-extra-documents', 'partner-extra-documents', false);

CREATE POLICY "Partner extra docs viewable by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'partner-extra-documents');

CREATE POLICY "Partner extra docs uploadable by admin or manager"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'partner-extra-documents'
    AND (
      (SELECT has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT has_role(auth.uid(), 'manager'::app_role))
    )
  );

CREATE POLICY "Partner extra docs deletable by admin or manager"
  ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'partner-extra-documents'
    AND (
      (SELECT has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT has_role(auth.uid(), 'manager'::app_role))
    )
  );
