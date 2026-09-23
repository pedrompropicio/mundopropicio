CREATE POLICY "Card docs viewable by accountant"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'card-documents'
  AND public.has_role(auth.uid(), 'accountant'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.card_sessions s
    WHERE s.id::text = (storage.foldername(objects.name))[1]
      AND public.row_belongs_to_current_company(s.company_id)
  )
);

ALTER TABLE public.document_download_audit
  DROP CONSTRAINT IF EXISTS document_download_audit_resource_type_check;
ALTER TABLE public.document_download_audit
  ADD CONSTRAINT document_download_audit_resource_type_check
  CHECK (resource_type = ANY (ARRAY['transaction_document'::text,'zip_export'::text,'supplier_document'::text,'camarim_document'::text,'card_document'::text]));

CREATE OR REPLACE FUNCTION public.record_document_download(p_resource_type text, p_resource_id uuid DEFAULT NULL::uuid, p_bucket text DEFAULT NULL::text, p_file_path text DEFAULT NULL::text, p_file_name text DEFAULT NULL::text, p_period_from date DEFAULT NULL::date, p_period_to date DEFAULT NULL::date, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF p_resource_type NOT IN ('transaction_document','zip_export','supplier_document','camarim_document','card_document') THEN
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
$function$;