-- D-ERP37 — Funções SECURITY DEFINER fechadas por omissão.
-- Em Postgres toda a função nasce com EXECUTE para PUBLIC; anon/authenticated
-- herdam de PUBLIC, logo REVOKE nominal não basta. Revoga-se sempre FROM PUBLIC.
-- Nenhuma destas funções é usada em políticas de RLS (verificado em pg_policy)
-- nem chamada pelo frontend via supabase.rpc.

-- (b) só chamadas por edge functions com service role key
REVOKE EXECUTE ON FUNCTION public.create_vault_secret(_name text, _value text, _description text) FROM PUBLIC; -- (b) escrita de segredos no vault
REVOKE EXECUTE ON FUNCTION public.update_vault_secret(_id uuid, _value text) FROM PUBLIC; -- (b) escrita de segredos no vault
REVOKE EXECUTE ON FUNCTION public.upsert_vault_secret(_name text, _value text, _description text) FROM PUBLIC; -- (b) escrita de segredos no vault
REVOKE EXECUTE ON FUNCTION public.crm_upsert_meta_connection(p_company_id uuid, p_user_id uuid, p_external_business_id text, p_external_business_name text, p_access_token text, p_token_type text, p_expires_at timestamp with time zone, p_master_key text, p_available_ad_accounts jsonb) FROM PUBLIC; -- (b) grava token Meta cifrado
REVOKE EXECUTE ON FUNCTION public.crm_consume_oauth_state(p_state_id uuid) FROM PUBLIC; -- (b) consome estado OAuth
REVOKE EXECUTE ON FUNCTION public.crm_write_audit_log(p_company_id uuid, p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_payload_before jsonb, p_payload_after jsonb, p_ip_address inet, p_user_agent text) FROM PUBLIC; -- (b) escreve log de auditoria
REVOKE EXECUTE ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(p_company_id uuid) FROM PUBLIC; -- (b) automatismo de ligação de campanhas
REVOKE EXECUTE ON FUNCTION public.process_lead_captures_batch(p_batch_size integer) FROM PUBLIC; -- (b) processa leads em lote
REVOKE EXECUTE ON FUNCTION public.process_leads_capi_batch(p_batch_size integer) FROM PUBLIC; -- (b) processa envios CAPI em lote
REVOKE EXECUTE ON FUNCTION public.process_redirect_logs_batch(p_batch_size integer) FROM PUBLIC; -- (b) processa redirects em lote
REVOKE EXECUTE ON FUNCTION public.set_coala_match_source(source text) FROM PUBLIC; -- (b) parâmetro de sessão do sync Coala
REVOKE EXECUTE ON FUNCTION public.resolve_ads_event(p_company_id uuid, p_campaign_name text, p_billing_period date) FROM PUBLIC; -- (b) resolução de evento na importação de faturas de anúncios

-- (c) só chamadas de dentro de outras funções SECURITY DEFINER, triggers ou crons
REVOKE EXECUTE ON FUNCTION public.enqueue_whatsapp_notification(p_template_name text, p_recipient_profile_id uuid, p_params jsonb, p_event_id uuid, p_context_type text, p_context_id uuid) FROM PUBLIC; -- (c) 6 chamadores internos
REVOKE EXECUTE ON FUNCTION public.get_or_create_generic_camarim_supplier(_company_id uuid) FROM PUBLIC; -- (c) chamada interna do fecho de camarim
REVOKE EXECUTE ON FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid) FROM PUBLIC; -- (c) 4 chamadores internos (guardas BP<->TX)
REVOKE EXECUTE ON FUNCTION public.validate_tx_category_l2_match(_tx_category_id uuid, _forecast_id uuid) FROM PUBLIC; -- (c) guarda interna de rubrica
REVOKE EXECUTE ON FUNCTION public.portal_tick_lead_capture() FROM PUBLIC; -- (c) cron do portal (só citada em texto na UI)
REVOKE EXECUTE ON FUNCTION public.portal_tick_redirect_log() FROM PUBLIC; -- (c) cron do portal

-- (d) não chamadas em lado nenhum (nem src/, nem supabase/functions/, nem no DB)
REVOKE EXECUTE ON FUNCTION public.coala_send_early_bird_batch(p_limit integer, p_dry_run boolean) FROM PUBLIC; -- (d) envio em lote, uso manual/cron
REVOKE EXECUTE ON FUNCTION public.run_operacao_sla_escalator() FROM PUBLIC; -- (d) escalador de SLA, cron
REVOKE EXECUTE ON FUNCTION public.get_user_role(_user_id uuid) FROM PUBLIC; -- (d) expõe papel de qualquer utilizador
REVOKE EXECUTE ON FUNCTION public.has_partner_access(_user_id uuid, _event_id uuid) FROM PUBLIC; -- (d) expõe acesso de sócio
REVOKE EXECUTE ON FUNCTION public.has_role_in(_user_id uuid, _role app_role, _company_id uuid) FROM PUBLIC; -- (d) expõe papéis por empresa
REVOKE EXECUTE ON FUNCTION public.has_company_feature(_company_id uuid, _feature_key text) FROM PUBLIC; -- (d) expõe features por empresa