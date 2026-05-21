
-- 1) Table
CREATE TABLE public.event_forecast_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES public.event_forecasts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_efa_forecast ON public.event_forecast_attachments(forecast_id);
CREATE INDEX idx_efa_company_created ON public.event_forecast_attachments(company_id, created_at DESC);

ALTER TABLE public.event_forecast_attachments ENABLE ROW LEVEL SECURITY;

-- 2) RLS: members can SELECT
CREATE POLICY "efa select members"
ON public.event_forecast_attachments
FOR SELECT
USING (
  is_platform_admin()
  OR company_id = current_company_id()
);

-- INSERT: admin/manager/editor
CREATE POLICY "efa insert privileged"
ON public.event_forecast_attachments
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

-- DELETE: admin/manager/editor
CREATE POLICY "efa delete privileged"
ON public.event_forecast_attachments
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
-- UPDATE: not allowed (no policy)

-- 3) Trigger: max 10 attachments per forecast
CREATE OR REPLACE FUNCTION public.efa_enforce_max_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.event_forecast_attachments
  WHERE forecast_id = NEW.forecast_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Cada linha do BP suporta no máximo 10 anexos.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_efa_max_attachments
BEFORE INSERT ON public.event_forecast_attachments
FOR EACH ROW EXECUTE FUNCTION public.efa_enforce_max_attachments();

-- 4) Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('event-forecast-attachments', 'event-forecast-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

-- 5) Storage RLS (isolated by company_id as first path segment)
CREATE POLICY "efa-storage select members"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'event-forecast-attachments'
  AND (
    is_platform_admin()
    OR (storage.foldername(name))[1] = current_company_id()::text
  )
);

CREATE POLICY "efa-storage insert privileged"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'event-forecast-attachments'
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

CREATE POLICY "efa-storage delete privileged"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'event-forecast-attachments'
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
