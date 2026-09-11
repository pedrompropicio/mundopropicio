-- D-ERP37 (parte 2). Nestas funções o EXECUTE não vem de PUBLIC: a ACL tem
-- grants NOMINAIS a anon e authenticated (proacl: anon=X, authenticated=X, sem
-- entrada PUBLIC). Por isso o REVOKE ... FROM PUBLIC da migração anterior foi
-- no-op e o revoke correcto aqui é nominal. service_role mantém EXECUTE.

-- (b) só chamadas por edge functions com service role key
REVOKE EXECUTE ON FUNCTION public.create_vault_secret(_name text, _value text, _description text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_vault_secret(_id uuid, _value text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_vault_secret(_name text, _value text, _description text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_upsert_meta_connection(p_company_id uuid, p_user_id uuid, p_external_business_id text, p_external_business_name text, p_access_token text, p_token_type text, p_expires_at timestamp with time zone, p_master_key text, p_available_ad_accounts jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_consume_oauth_state(p_state_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_write_audit_log(p_company_id uuid, p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_payload_before jsonb, p_payload_after jsonb, p_ip_address inet, p_user_agent text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(p_company_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_lead_captures_batch(p_batch_size integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_leads_capi_batch(p_batch_size integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_redirect_logs_batch(p_batch_size integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_coala_match_source(source text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_ads_event(p_company_id uuid, p_campaign_name text, p_billing_period date) FROM anon, authenticated;

-- (c) só chamadas de dentro de outras funções SECURITY DEFINER, triggers ou crons
REVOKE EXECUTE ON FUNCTION public.enqueue_whatsapp_notification(p_template_name text, p_recipient_profile_id uuid, p_params jsonb, p_event_id uuid, p_context_type text, p_context_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_generic_camarim_supplier(_company_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_tx_category_l2_match(_tx_category_id uuid, _forecast_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_tick_lead_capture() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_tick_redirect_log() FROM anon, authenticated;

-- (d) não chamadas em lado nenhum
REVOKE EXECUTE ON FUNCTION public.coala_send_early_bird_batch(p_limit integer, p_dry_run boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_operacao_sla_escalator() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(_user_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_partner_access(_user_id uuid, _event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role_in(_user_id uuid, _role app_role, _company_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_company_feature(_company_id uuid, _feature_key text) FROM anon, authenticated;