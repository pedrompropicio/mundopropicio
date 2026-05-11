CREATE OR REPLACE FUNCTION crm.get_meta_decrypted_token(
  p_connection_id uuid,
  p_master_key text
)
RETURNS TABLE(
  access_token text,
  external_business_id text,
  external_business_name text,
  company_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $$
DECLARE
  v_encrypted text;
  v_business_id text;
  v_business_name text;
  v_company_id uuid;
  v_caller_company uuid;
BEGIN
  v_caller_company := public.current_company_id();
  IF v_caller_company IS NULL THEN
    RAISE EXCEPTION 'No active company for caller (auth.uid()=%)', auth.uid();
  END IF;

  SELECT apc.access_token_encrypted,
         apc.external_business_id,
         apc.external_business_name,
         apc.company_id
  INTO v_encrypted, v_business_id, v_business_name, v_company_id
  FROM crm.ad_platform_connections apc
  WHERE apc.id = p_connection_id
    AND apc.platform = 'meta'
    AND apc.status = 'active'
    AND apc.company_id = v_caller_company;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Active Meta connection not found or not authorised (id=%, caller_company=%)',
      p_connection_id, v_caller_company;
  END IF;

  RETURN QUERY
  SELECT extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), p_master_key)::text,
         v_business_id,
         v_business_name,
         v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_get_meta_decrypted_token(
  p_connection_id uuid,
  p_master_key text
)
RETURNS TABLE(
  access_token text,
  external_business_id text,
  external_business_name text,
  company_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $$
  SELECT * FROM crm.get_meta_decrypted_token(p_connection_id, p_master_key);
$$;

REVOKE ALL ON FUNCTION crm.get_meta_decrypted_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_get_meta_decrypted_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.get_meta_decrypted_token(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_get_meta_decrypted_token(uuid, text) TO authenticated;