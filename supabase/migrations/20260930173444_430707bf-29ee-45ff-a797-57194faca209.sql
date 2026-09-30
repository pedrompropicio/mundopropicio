SET lock_timeout = '5s';

CREATE TABLE public.storage_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  object_path text NOT NULL,
  deleted_by uuid,
  deleted_by_email text,
  company_id uuid,
  reason text,
  related_table text,
  related_id uuid,
  trashed_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.storage_deletion_log FROM anon, authenticated;
GRANT SELECT ON public.storage_deletion_log TO authenticated;
GRANT ALL ON public.storage_deletion_log TO service_role;
ALTER TABLE public.storage_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY storage_deletion_log_admin_select ON public.storage_deletion_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role));
CREATE POLICY company_isolation_storage_deletion_log ON public.storage_deletion_log
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id));
CREATE INDEX storage_deletion_log_bucket_path_idx ON public.storage_deletion_log (bucket, object_path);
CREATE INDEX storage_deletion_log_created_idx ON public.storage_deletion_log (created_at DESC);

-- Mesmas regras das políticas de DELETE em storage.objects (que serão retiradas na trava).
CREATE OR REPLACE FUNCTION public.can_delete_storage_object(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR p_name = '' OR p_name LIKE '%/' OR p_name LIKE '_trash/%' THEN
    RETURN false;
  END IF;
  IF p_bucket IN ('transaction-documents','closing-cost-documents','supplier-documents') THEN
    RETURN (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'manager'::app_role))
       AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'ticket-office-settlements' THEN
    RETURN has_role(v_uid,'admin'::app_role) AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'camarim-documents' THEN
    SELECT owner INTO v_owner FROM storage.objects WHERE bucket_id = p_bucket AND name = p_name;
    RETURN (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'manager'::app_role)
            OR has_permission(v_uid,'camarim_manage')
            OR (has_permission(v_uid,'camarim_team') AND v_owner = v_uid))
       AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'card-documents' THEN
    RETURN can_manage_cards(v_uid) OR EXISTS (
      SELECT 1 FROM card_sessions s
      WHERE s.id::text = split_part(p_name, '/', 1) AND s.status = 'open' AND s.holder_profile_id = v_uid);
  ELSIF p_bucket = 'standalone-invoices' THEN
    RETURN split_part(p_name, '/', 1) = current_company_id()::text
       AND (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'platform_admin'::app_role)
            OR has_role(v_uid,'manager'::app_role) OR has_role(v_uid,'editor'::app_role));
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_delete_storage_object(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_storage_object(text, text) TO authenticated, service_role;

-- Passo 3: alinhar remoção de anexo com o armazém (admin/manager).
DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON public.transaction_documents;
CREATE POLICY "Transaction docs deletable by privileged roles" ON public.transaction_documents
  FOR DELETE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role));