
-- Table for artist/cache extra expenses (deducted from artist's cache payment)
CREATE TABLE public.event_cache_extras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  cache_config_id UUID NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_cache_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache extras viewable by authenticated"
  ON public.event_cache_extras FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Cache extras insertable by admin or manager"
  ON public.event_cache_extras FOR INSERT
  TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Cache extras updatable by admin or manager"
  ON public.event_cache_extras FOR UPDATE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Cache extras deletable by admin or manager"
  ON public.event_cache_extras FOR DELETE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER update_event_cache_extras_updated_at
  BEFORE UPDATE ON public.event_cache_extras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for cache extra documents
INSERT INTO storage.buckets (id, name, public) VALUES ('cache-extra-documents', 'cache-extra-documents', false);

CREATE POLICY "Cache extra docs viewable by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'cache-extra-documents');

CREATE POLICY "Cache extra docs uploadable by admin or manager"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'cache-extra-documents'
    AND (
      (SELECT has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT has_role(auth.uid(), 'manager'::app_role))
    )
  );

CREATE POLICY "Cache extra docs deletable by admin or manager"
  ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'cache-extra-documents'
    AND (
      (SELECT has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT has_role(auth.uid(), 'manager'::app_role))
    )
  );
