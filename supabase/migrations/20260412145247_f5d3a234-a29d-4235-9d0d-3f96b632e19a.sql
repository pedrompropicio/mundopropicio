
-- Create event_implementations table
CREATE TABLE public.event_implementations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reference_file_url TEXT,
  reference_file_name TEXT,
  import_instructions TEXT,
  notes TEXT,
  event_structure JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_implementations ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Implementations viewable by admin"
  ON public.event_implementations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Implementations insertable by admin"
  ON public.event_implementations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Implementations updatable by admin"
  ON public.event_implementations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Implementations deletable by admin"
  ON public.event_implementations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_event_implementations_updated_at
  BEFORE UPDATE ON public.event_implementations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('implementation-files', 'implementation-files', false);

-- Storage policies (admin only)
CREATE POLICY "Admin can upload implementation files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'implementation-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view implementation files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'implementation-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete implementation files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'implementation-files' AND public.has_role(auth.uid(), 'admin'));
