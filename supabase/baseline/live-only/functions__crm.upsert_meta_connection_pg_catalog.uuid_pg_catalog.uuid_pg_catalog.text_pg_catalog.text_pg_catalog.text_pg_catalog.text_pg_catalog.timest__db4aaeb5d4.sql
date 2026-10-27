-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:crm.upsert_meta_connection(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.text,pg_catalog.jsonb)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "4a52c9ef670ef8df20d16a4bad3a68693840b03fc35466c504adb57f28264bd6", "live_properties_sha256": "8616e4cc140e65ebacba6127049a3c3a30f1e8ce20069ddbc1ecd3b3a2019721", "oid": 77874, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "4defaead3c3853c836257086adec44e8dd9c0a5806e7c1650763becb6db3d756", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3cf940248823deb82a4eab8c949c1b872113014ba9fd81abc2418961e5a0f7e6
CREATE OR REPLACE FUNCTION crm.upsert_meta_connection(p_company_id uuid, p_user_id uuid, p_external_business_id text, p_external_business_name text, p_access_token text, p_token_type text, p_expires_at timestamp with time zone, p_master_key text, p_available_ad_accounts jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_connection_id UUID;
  v_encrypted     TEXT;
BEGIN
  v_encrypted := encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  INSERT INTO crm.ad_platform_connections (
    company_id, platform, external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, status, connected_by, connected_at,
    last_validated_at, consecutive_failures
  ) VALUES (
    p_company_id, 'meta', p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, 'active', p_user_id, now(),
    now(), 0
  )
  ON CONFLICT (company_id, platform) WHERE artist_id IS NULL DO UPDATE SET
    external_business_id    = EXCLUDED.external_business_id,
    external_business_name  = EXCLUDED.external_business_name,
    access_token_encrypted  = EXCLUDED.access_token_encrypted,
    token_type              = EXCLUDED.token_type,
    expires_at              = EXCLUDED.expires_at,
    available_ad_accounts   = EXCLUDED.available_ad_accounts,
    status                  = 'active',
    connected_by            = EXCLUDED.connected_by,
    connected_at            = now(),
    disconnected_at         = NULL,
    last_validated_at       = now(),
    last_error              = NULL,
    consecutive_failures    = 0
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$function$
;

ALTER FUNCTION crm.upsert_meta_connection(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.text,pg_catalog.jsonb) OWNER TO "postgres";
-- END OPERATION 3cf940248823deb82a4eab8c949c1b872113014ba9fd81abc2418961e5a0f7e6
