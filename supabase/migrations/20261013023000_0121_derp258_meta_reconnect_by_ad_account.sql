-- D-ERP258: religação Meta do artista procura a ligação por (artista, meta, conta de anúncios),
-- reativa-a mesmo revoked e nunca altera ligações de outras contas.
CREATE OR REPLACE FUNCTION crm.upsert_artist_meta_connection(p_company_id uuid, p_artist_id uuid, p_user_id uuid, p_external_business_id text, p_external_business_name text, p_access_token text, p_token_type text, p_expires_at timestamp with time zone, p_master_key text, p_available_ad_accounts jsonb DEFAULT NULL::jsonb, p_status text DEFAULT 'pending_selection'::text, p_selected_ad_account_id text DEFAULT NULL::text, p_selected_ad_account_name text DEFAULT NULL::text, p_selected_ad_account_currency text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_encrypted text := encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64');
BEGIN
  IF p_selected_ad_account_id IS NOT NULL THEN
    -- 1) a ligação desta conta (qualquer estado, incl. revoked) → reativar, mantendo id/teto/snapshots
    SELECT c.id INTO v_id FROM crm.ad_platform_connections c
     WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
       AND c.platform = 'meta' AND c.connection_scope = 'artist'
       AND c.selected_ad_account_id = p_selected_ad_account_id
     ORDER BY c.connected_at ASC NULLS LAST LIMIT 1;
    IF v_id IS NULL THEN
      -- 2) reaproveitar uma linha pendente de escolha (sem conta)
      SELECT c.id INTO v_id FROM crm.ad_platform_connections c
       WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
         AND c.platform = 'meta' AND c.connection_scope = 'artist'
         AND c.selected_ad_account_id IS NULL
       ORDER BY c.connected_at ASC NULLS LAST LIMIT 1;
    END IF;
    IF v_id IS NOT NULL THEN
      UPDATE crm.ad_platform_connections c SET
        access_token_encrypted = v_encrypted, token_type = p_token_type, expires_at = p_expires_at,
        available_ad_accounts = coalesce(p_available_ad_accounts, c.available_ad_accounts),
        selected_ad_account_id = p_selected_ad_account_id,
        selected_ad_account_name = coalesce(p_selected_ad_account_name, c.selected_ad_account_name),
        selected_ad_account_currency = coalesce(p_selected_ad_account_currency, c.selected_ad_account_currency),
        external_business_id = coalesce(c.external_business_id, p_external_business_id),
        external_business_name = coalesce(c.external_business_name, p_external_business_name),
        status = 'active', connected_by = coalesce(p_user_id, c.connected_by),
        last_validated_at = now(), last_error = NULL, consecutive_failures = 0, disconnected_at = NULL
      WHERE c.id = v_id;
      RETURN v_id;
    END IF;
  ELSE
    -- Várias contas e nenhuma escolhida: só uma linha pendente de escolha; as outras ligações não são tocadas.
    SELECT c.id INTO v_id FROM crm.ad_platform_connections c
     WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
       AND c.platform = 'meta' AND c.connection_scope = 'artist'
       AND c.selected_ad_account_id IS NULL
     ORDER BY c.connected_at ASC NULLS LAST LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE crm.ad_platform_connections c SET
        access_token_encrypted = v_encrypted, token_type = p_token_type, expires_at = p_expires_at,
        available_ad_accounts = coalesce(p_available_ad_accounts, c.available_ad_accounts),
        external_business_id = p_external_business_id, external_business_name = p_external_business_name,
        status = 'pending_selection', connected_by = coalesce(p_user_id, c.connected_by),
        last_validated_at = now(), last_error = NULL, consecutive_failures = 0, disconnected_at = NULL,
        connected_at = now()
      WHERE c.id = v_id;
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO crm.ad_platform_connections (
    company_id, artist_id, connection_scope, platform,
    external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, selected_ad_account_id, selected_ad_account_name,
    selected_ad_account_currency, status, connected_by, connected_at,
    last_validated_at, last_error, consecutive_failures, disconnected_at
  ) VALUES (
    p_company_id, p_artist_id, 'artist', 'meta',
    p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, p_selected_ad_account_id, p_selected_ad_account_name,
    p_selected_ad_account_currency,
    CASE WHEN p_selected_ad_account_id IS NOT NULL THEN 'active' ELSE 'pending_selection' END,
    p_user_id, now(), now(), NULL, 0, NULL
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Escolha de conta numa linha pendente: se a conta já tem ligação (ex.: revoked), funde a pendente nela.
CREATE OR REPLACE FUNCTION crm.select_artist_meta_ad_account(p_pending_id uuid, p_ad_account_id text, p_name text, p_currency text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'crm', 'public' AS $function$
DECLARE p record; v_id uuid; BEGIN
  SELECT * INTO p FROM crm.ad_platform_connections WHERE id = p_pending_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ligação não encontrada'; END IF;
  SELECT id INTO v_id FROM crm.ad_platform_connections
   WHERE company_id = p.company_id AND artist_id IS NOT DISTINCT FROM p.artist_id AND platform = p.platform
     AND connection_scope = p.connection_scope AND selected_ad_account_id = p_ad_account_id AND id <> p_pending_id
   LIMIT 1;
  IF v_id IS NULL THEN
    UPDATE crm.ad_platform_connections SET selected_ad_account_id = p_ad_account_id,
      selected_ad_account_name = p_name, selected_ad_account_currency = p_currency,
      status = 'active', last_error = NULL, disconnected_at = NULL WHERE id = p_pending_id;
    RETURN p_pending_id;
  END IF;
  IF p.selected_ad_account_id IS NOT NULL THEN RAISE EXCEPTION 'a ligação de origem já tem conta'; END IF;
  UPDATE crm.ad_platform_connections c SET
    access_token_encrypted = p.access_token_encrypted, token_type = p.token_type, expires_at = p.expires_at,
    available_ad_accounts = coalesce(p.available_ad_accounts, c.available_ad_accounts),
    selected_ad_account_name = coalesce(p_name, c.selected_ad_account_name),
    selected_ad_account_currency = coalesce(p_currency, c.selected_ad_account_currency),
    status = 'active', connected_by = coalesce(p.connected_by, c.connected_by),
    last_validated_at = now(), last_error = NULL, consecutive_failures = 0, disconnected_at = NULL
  WHERE c.id = v_id;
  DELETE FROM crm.ad_platform_connections WHERE id = p_pending_id;
  RETURN v_id;
END $function$;
CREATE OR REPLACE FUNCTION public.crm_select_artist_meta_ad_account(p_pending_id uuid, p_ad_account_id text, p_name text, p_currency text)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $$ SELECT crm.select_artist_meta_ad_account(p_pending_id, p_ad_account_id, p_name, p_currency) $$;
REVOKE ALL ON FUNCTION crm.select_artist_meta_ad_account(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_select_artist_meta_ad_account(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.select_artist_meta_ad_account(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_select_artist_meta_ad_account(uuid,text,text,text) TO service_role;