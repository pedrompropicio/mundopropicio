-- Wrappers em public para CRM RPC functions (contorna PostgREST schema cache stale para crm.*)
-- Necessário porque a edge function crm-meta-oauth-callback chama public.crm_* em vez de crm.*
-- Aplicação condicional: apenas cria o wrapper se a função crm.* correspondente existir.

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='crm' AND p.proname='consume_oauth_state') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.crm_consume_oauth_state(p_state_id UUID)
      RETURNS TABLE (company_id UUID, user_id UUID, platform TEXT, valid BOOLEAN)
      LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
      AS 'SELECT * FROM crm.consume_oauth_state(p_state_id);';
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.crm_consume_oauth_state(UUID) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.crm_consume_oauth_state(UUID) TO service_role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='crm' AND p.proname='upsert_meta_connection') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.crm_upsert_meta_connection(
        p_company_id UUID, p_user_id UUID, p_external_business_id TEXT, p_external_business_name TEXT,
        p_access_token TEXT, p_token_type TEXT, p_expires_at TIMESTAMPTZ, p_master_key TEXT,
        p_available_ad_accounts JSONB DEFAULT NULL
      )
      RETURNS UUID
      LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
      AS 'SELECT crm.upsert_meta_connection(p_company_id, p_user_id, p_external_business_id, p_external_business_name, p_access_token, p_token_type, p_expires_at, p_master_key, p_available_ad_accounts);';
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.crm_upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.crm_upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO service_role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='crm' AND p.proname='write_audit_log') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.crm_write_audit_log(
        p_company_id UUID, p_user_id UUID, p_action TEXT, p_entity_type TEXT, p_entity_id UUID,
        p_payload_before JSONB DEFAULT NULL, p_payload_after JSONB DEFAULT NULL,
        p_ip_address INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL
      )
      RETURNS BIGINT
      LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
      AS 'SELECT crm.write_audit_log(p_company_id, p_user_id, p_action, p_entity_type, p_entity_id, p_payload_before, p_payload_after, p_ip_address, p_user_agent);';
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.crm_write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.crm_write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) TO service_role';
  END IF;
END
$mig$;

SELECT pg_notify('pgrst', 'reload schema');