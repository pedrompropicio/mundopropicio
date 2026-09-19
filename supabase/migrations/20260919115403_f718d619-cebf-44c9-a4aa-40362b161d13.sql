-- D-ERP95 F3 — activação do alvo música: aprovação registada, tetos e histórico.

-- (a) approved_by no log de acções Meta + vista unificada
ALTER TABLE crm.meta_entity_actions_log ADD COLUMN IF NOT EXISTS approved_by uuid NULL;

DROP VIEW IF EXISTS crm.v_ads_entity_actions_log;
CREATE VIEW crm.v_ads_entity_actions_log WITH (security_invoker = true) AS
  SELECT l.id, l.company_id, l.connection_id, 'meta'::text AS platform, l.ad_account_id,
         l.entity_type, l.external_id, l.entity_name, l.action, l.prev_status, l.new_status,
         l.updates_jsonb, l.success, l.error_message,
         l.meta_response_jsonb AS platform_response_jsonb,
         l.performed_by, l.approved_by, l.performed_at
  FROM crm.meta_entity_actions_log l
  UNION ALL
  SELECT a.id, a.company_id, a.connection_id, a.platform, a.ad_account_id,
         a.entity_type, a.external_id, a.entity_name, a.action, a.prev_status, a.new_status,
         a.updates_jsonb, a.success, a.error_message, a.platform_response_jsonb,
         a.performed_by, a.approved_by, a.performed_at
  FROM crm.ads_entity_actions_log a;

REVOKE ALL ON crm.v_ads_entity_actions_log FROM PUBLIC, anon;
GRANT SELECT ON crm.v_ads_entity_actions_log TO authenticated, service_role;

-- (b) histórico dos tetos
CREATE TABLE IF NOT EXISTS crm.artist_ads_budget_caps_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_id uuid NOT NULL,
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  platform text NOT NULL,
  daily_cap numeric NOT NULL,
  currency text NOT NULL,
  notes text NULL,
  changed_by uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL CHECK (change_type IN ('set','update','remove'))
);
CREATE INDEX IF NOT EXISTS artist_ads_budget_caps_history_conn_idx
  ON crm.artist_ads_budget_caps_history (connection_id, changed_at DESC);

GRANT SELECT ON crm.artist_ads_budget_caps_history TO authenticated;
GRANT ALL ON crm.artist_ads_budget_caps_history TO service_role;
ALTER TABLE crm.artist_ads_budget_caps_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artist_ads_budget_caps_history_select ON crm.artist_ads_budget_caps_history;
CREATE POLICY artist_ads_budget_caps_history_select
  ON crm.artist_ads_budget_caps_history FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS artist_ads_budget_caps_history_service ON crm.artist_ads_budget_caps_history;
CREATE POLICY artist_ads_budget_caps_history_service
  ON crm.artist_ads_budget_caps_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION crm.log_artist_ads_budget_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm','public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO crm.artist_ads_budget_caps_history
      (cap_id, company_id, artist_id, connection_id, platform, daily_cap, currency, notes, changed_by, change_type)
    VALUES (OLD.id, OLD.company_id, OLD.artist_id, OLD.connection_id, OLD.platform,
            OLD.daily_cap, OLD.currency, OLD.notes, auth.uid(), 'remove');
    RETURN OLD;
  END IF;
  INSERT INTO crm.artist_ads_budget_caps_history
    (cap_id, company_id, artist_id, connection_id, platform, daily_cap, currency, notes, changed_by, change_type)
  VALUES (NEW.id, NEW.company_id, NEW.artist_id, NEW.connection_id, NEW.platform,
          NEW.daily_cap, NEW.currency, NEW.notes, coalesce(NEW.set_by, auth.uid()),
          CASE WHEN TG_OP = 'INSERT' THEN 'set' ELSE 'update' END);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_artist_ads_budget_cap ON crm.artist_ads_budget_caps;
CREATE TRIGGER trg_log_artist_ads_budget_cap
  AFTER INSERT OR UPDATE OR DELETE ON crm.artist_ads_budget_caps
  FOR EACH ROW EXECUTE FUNCTION crm.log_artist_ads_budget_cap();

-- Orçamento diário de um plano (vitalício ÷ dias da janela).
CREATE OR REPLACE FUNCTION crm.artist_ads_plan_daily(p_adsets jsonb, p_start timestamptz, p_end timestamptz)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_end IS NOT NULL THEN
      coalesce((SELECT sum(greatest(0, coalesce((a->>'orcamento_cents')::numeric, 0)))
                FROM jsonb_array_elements(coalesce(p_adsets,'[]'::jsonb)) a), 0)
      / greatest(1, ceil(extract(epoch FROM (p_end - coalesce(p_start, p_end))) / 86400.0))
      / 100.0
    ELSE
      coalesce((SELECT sum(greatest(0, coalesce((a->>'orcamento_cents')::numeric, 0)))
                FROM jsonb_array_elements(coalesce(p_adsets,'[]'::jsonb)) a), 0) / 100.0
  END
$$;

-- (c) administração do teto — só admin/platform_admin
CREATE OR REPLACE FUNCTION public.artist_ads_assert_cap_admin(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_uid,'platform_admin'::app_role) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.company_id = p_company_id AND ur.role = 'admin'
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'só administradores podem definir tetos de orçamento' USING ERRCODE = '42501';
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_set(
  p_connection_id uuid, p_daily_cap numeric, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_conn crm.ad_platform_connections; v_id uuid;
BEGIN
  SELECT * INTO v_conn FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist';
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios de artista inexistente' USING ERRCODE = '42501';
  END IF;
  PERFORM public.artist_ads_assert_cap_admin(v_conn.company_id);
  IF v_conn.selected_ad_account_currency IS NULL THEN
    RAISE EXCEPTION 'a conta ainda não tem moeda definida' USING ERRCODE = '22023';
  END IF;
  IF p_daily_cap IS NULL OR p_daily_cap <= 0 THEN
    RAISE EXCEPTION 'o teto diário tem de ser maior que zero' USING ERRCODE = '22023';
  END IF;

  INSERT INTO crm.artist_ads_budget_caps
    (company_id, artist_id, connection_id, platform, daily_cap, currency, notes, set_by, set_at)
  VALUES (v_conn.company_id, v_conn.artist_id, v_conn.id, v_conn.platform,
          p_daily_cap, upper(v_conn.selected_ad_account_currency), p_notes, auth.uid(), now())
  ON CONFLICT (connection_id) DO UPDATE
    SET daily_cap = EXCLUDED.daily_cap,
        currency = EXCLUDED.currency,
        notes = EXCLUDED.notes,
        set_by = EXCLUDED.set_by,
        set_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_remove(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist';
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios de artista inexistente' USING ERRCODE = '42501';
  END IF;
  PERFORM public.artist_ads_assert_cap_admin(v_company);
  DELETE FROM crm.artist_ads_budget_caps WHERE connection_id = p_connection_id;
END $$;

-- (d) cap_get + committed_daily / available_daily (colunas novas no fim)
DROP FUNCTION IF EXISTS public.artist_ads_budget_cap_get(uuid);
CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_get(p_artist_id uuid)
RETURNS TABLE(platform text, connection_id uuid, account_id text, account_name text,
              account_currency text, status text, has_cap boolean, daily_cap numeric,
              cap_currency text, set_at timestamp with time zone,
              committed_daily numeric, available_daily numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  RETURN QUERY
  SELECT c.platform, c.id, c.selected_ad_account_id, c.selected_ad_account_name,
         c.selected_ad_account_currency, c.status,
         (b.id IS NOT NULL), b.daily_cap, b.currency, b.set_at,
         coalesce(comp.total, 0)::numeric,
         CASE WHEN b.id IS NULL THEN NULL ELSE b.daily_cap - coalesce(comp.total, 0) END
  FROM crm.ad_platform_connections c
  LEFT JOIN crm.artist_ads_budget_caps b ON b.connection_id = c.id
  LEFT JOIN LATERAL (
    SELECT sum(crm.artist_ads_plan_daily(p.adsets, p.start_time, p.end_time)) AS total
    FROM crm.meta_publish_plan p
    WHERE p.connection_id = c.id AND p.song_id IS NOT NULL
      AND p.estado IN ('publicado','ativo')
  ) comp ON true
  WHERE c.connection_scope = 'artist'
    AND c.artist_id = p_artist_id
    AND c.company_id = v_company
  ORDER BY c.platform, c.selected_ad_account_id;
END $$;

-- Grants (regra D-ERP94)
REVOKE EXECUTE ON FUNCTION public.artist_ads_assert_cap_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_budget_cap_set(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_budget_cap_remove(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_budget_cap_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_assert_cap_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_budget_cap_set(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_budget_cap_remove(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_budget_cap_get(uuid) TO authenticated, service_role;