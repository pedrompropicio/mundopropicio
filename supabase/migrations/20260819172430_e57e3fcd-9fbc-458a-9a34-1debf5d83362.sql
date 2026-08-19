CREATE TABLE public.event_ab_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eaba_event ON public.event_ab_attachments(event_id);
CREATE INDEX idx_eaba_company_created ON public.event_ab_attachments(company_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.event_ab_attachments TO authenticated;
GRANT ALL ON public.event_ab_attachments TO service_role;

ALTER TABLE public.event_ab_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eaba select members"
ON public.event_ab_attachments
FOR SELECT
USING (
  is_platform_admin()
  OR company_id = current_company_id()
);

CREATE POLICY "eaba insert privileged"
ON public.event_ab_attachments
FOR INSERT
WITH CHECK (
  is_platform_admin()
  OR (
    company_id = current_company_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
    )
  )
);

CREATE POLICY "eaba delete privileged"
ON public.event_ab_attachments
FOR DELETE
USING (
  is_platform_admin()
  OR (
    company_id = current_company_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
    )
  )
);

CREATE OR REPLACE FUNCTION public.eaba_enforce_max_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.event_ab_attachments
  WHERE event_id = NEW.event_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'O separador A&B suporta no máximo 20 anexos por evento.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_eaba_max_attachments
BEFORE INSERT ON public.event_ab_attachments
FOR EACH ROW EXECUTE FUNCTION public.eaba_enforce_max_attachments();

CREATE POLICY "eaba-storage select members"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'event-ab-attachments'
  AND (
    is_platform_admin()
    OR (storage.foldername(name))[1] = current_company_id()::text
  )
);

CREATE POLICY "eaba-storage insert privileged"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'event-ab-attachments'
  AND (
    is_platform_admin()
    OR (
      (storage.foldername(name))[1] = current_company_id()::text
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'editor'::app_role)
      )
    )
  )
);

CREATE POLICY "eaba-storage delete privileged"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'event-ab-attachments'
  AND (
    is_platform_admin()
    OR (
      (storage.foldername(name))[1] = current_company_id()::text
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'editor'::app_role)
      )
    )
  )
);