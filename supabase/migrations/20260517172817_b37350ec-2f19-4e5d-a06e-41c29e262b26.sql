CREATE OR REPLACE FUNCTION crm.get_meta_decrypted_token(p_connection_id uuid, p_master_key text)
 RETURNS TABLE(access_token text, external_business_id text, external_business_name text, company_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_encrypted text;
  v_business_id text;
  v_business_name text;
  v_company_id uuid;
  v_caller_company uuid;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';

  IF v_is_service_role THEN
    -- Service-role (cron / server-to-server): bypass caller-company check.
    SELECT apc.access_token_encrypted, apc.external_business_id, apc.external_business_name, apc.company_id
    INTO v_encrypted, v_business_id, v_business_name, v_company_id
    FROM crm.ad_platform_connections apc
    WHERE apc.id = p_connection_id
      AND apc.platform = 'meta'
      AND apc.status = 'active';

    IF v_encrypted IS NULL THEN
      RAISE EXCEPTION 'Active Meta connection not found (id=%, service_role)', p_connection_id;
    END IF;
  ELSE
    -- User JWT: caller must have an active company and own the connection.
    v_caller_company := public.current_company_id();
    IF v_caller_company IS NULL THEN
      RAISE EXCEPTION 'No active company for caller (auth.uid()=%)', auth.uid();
    END IF;

    SELECT apc.access_token_encrypted, apc.external_business_id, apc.external_business_name, apc.company_id
    INTO v_encrypted, v_business_id, v_business_name, v_company_id
    FROM crm.ad_platform_connections apc
    WHERE apc.id = p_connection_id
      AND apc.platform = 'meta'
      AND apc.status = 'active'
      AND apc.company_id = v_caller_company;

    IF v_encrypted IS NULL THEN
      RAISE EXCEPTION 'Active Meta connection not found or not authorised (id=%, caller_company=%)', p_connection_id, v_caller_company;
    END IF;
  END IF;

  RETURN QUERY SELECT
    extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), p_master_key)::text,
    v_business_id,
    v_business_name,
    v_company_id;
END;
$function$;