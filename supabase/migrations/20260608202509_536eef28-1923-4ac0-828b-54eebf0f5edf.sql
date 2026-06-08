
CREATE TABLE public.document_download_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_role text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('transaction_document','zip_export','supplier_document')),
  resource_id uuid,
  bucket text,
  file_path text,
  file_name text,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  period_from date,
  period_to date,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_dda_company_time ON public.document_download_audit (company_id, downloaded_at DESC);
CREATE INDEX idx_dda_user_time ON public.document_download_audit (user_id, downloaded_at DESC);

GRANT SELECT ON public.document_download_audit TO authenticated;
GRANT ALL ON public.document_download_audit TO service_role;

ALTER TABLE public.document_download_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dda_select_admin_manager"
  ON public.document_download_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND public.row_belongs_to_current_company(company_id)
    )
  );

-- No client INSERT/UPDATE/DELETE policies — writes go through SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.record_document_download(
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_bucket text DEFAULT NULL,
  p_file_path text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_period_from date DEFAULT NULL,
  p_period_to date DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_company uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_resource_type NOT IN ('transaction_document','zip_export','supplier_document') THEN
    RAISE EXCEPTION 'invalid resource_type %', p_resource_type USING ERRCODE = '22023';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  ORDER BY CASE role::text
    WHEN 'platform_admin' THEN 0
    WHEN 'admin' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'accountant' THEN 3
    ELSE 9
  END
  LIMIT 1;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'no active company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.document_download_audit (
    company_id, user_id, user_email, user_role,
    resource_type, resource_id, bucket, file_path, file_name,
    period_from, period_to, extra_metadata
  ) VALUES (
    v_company, v_uid, COALESCE(v_email,'unknown'), COALESCE(v_role,'unknown'),
    p_resource_type, p_resource_id, p_bucket, p_file_path, p_file_name,
    p_period_from, p_period_to, COALESCE(p_extra,'{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_document_download(text,uuid,text,text,text,date,date,jsonb) TO authenticated;
