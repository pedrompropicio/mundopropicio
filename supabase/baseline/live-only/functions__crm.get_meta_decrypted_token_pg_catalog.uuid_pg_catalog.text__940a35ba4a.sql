-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:crm.get_meta_decrypted_token(pg_catalog.uuid,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "28553135911c82cfb2fb5399d179afdee9a379e7541796a3de5b720a4fb247dd", "live_properties_sha256": "84f8a5b44eb774bad3969a0b28676ee199e25f35a67422448d551a3eb62ffa13", "oid": 78462, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "d0d77501e8a7a9b3788663f63e67748176336f982858e9cae2a8c1686ac2549f", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 19be06bdeab27afdfd72dbcc46293ff855bb7c076a90ef90c5828442644e8ea0
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
BEGIN
  -- Guard 1: caller must have an active company resolvable via current_company_id()
  v_caller_company := public.current_company_id();
  IF v_caller_company IS NULL THEN
    RAISE EXCEPTION 'No active company for caller (auth.uid()=%)', auth.uid();
  END IF;

  -- Guard 2: connection must belong to caller's company
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

  RETURN QUERY SELECT
    extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), p_master_key)::text,
    v_business_id,
    v_business_name,
    v_company_id;
END;
$function$
;

ALTER FUNCTION crm.get_meta_decrypted_token(pg_catalog.uuid,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION 19be06bdeab27afdfd72dbcc46293ff855bb7c076a90ef90c5828442644e8ea0
