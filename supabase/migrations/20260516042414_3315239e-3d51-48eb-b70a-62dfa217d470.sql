
-- 1) Tabela auxiliar anti-flood de notificações de sync
CREATE TABLE IF NOT EXISTS public.sync_notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL,
  sync_type text NOT NULL,
  last_notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, sync_type)
);

ALTER TABLE public.sync_notifications_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read sync_notifications_sent"
  ON public.sync_notifications_sent FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- 2) View vw_sync_health (security invoker, respeita RLS subjacentes)
CREATE OR REPLACE VIEW public.vw_sync_health
WITH (security_invoker = true)
AS
WITH coala_last AS (
  SELECT r.*
  FROM public.coala_sync_runs r
  JOIN (
    SELECT config_id, max(started_at) AS m FROM public.coala_sync_runs GROUP BY config_id
  ) x ON x.config_id = r.config_id AND x.m = r.started_at
),
coala_agg AS (
  SELECT
    'Coala (Google Drive)'::text AS sync_name,
    max(started_at) AS last_run_at,
    (SELECT status FROM coala_last ORDER BY started_at DESC LIMIT 1) AS last_run_status,
    NULLIF(EXTRACT(EPOCH FROM (max(finished_at) - max(started_at)))::int, 0) AS last_run_duration_sec,
    EXTRACT(EPOCH FROM (now() - max(started_at)))::int AS seconds_since_last_run,
    count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status IN ('failed','blocked','needs_review','partial_failed','classify_failed','download_failed','parse_failed','import_failed')) AS runs_needing_action_24h,
    count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status = 'success') AS runs_success_24h,
    1::int AS expected_runs_24h,
    86400::int AS expected_interval_sec
  FROM public.coala_sync_runs
),
fever_runs_agg AS (
  SELECT
    'Fever (Reports)'::text AS sync_name,
    max(started_at) AS last_run_at,
    (SELECT status FROM public.fever_sync_runs ORDER BY started_at DESC LIMIT 1) AS last_run_status,
    NULLIF(EXTRACT(EPOCH FROM (max(finished_at) - max(started_at)))::int, 0) AS last_run_duration_sec,
    EXTRACT(EPOCH FROM (now() - max(started_at)))::int AS seconds_since_last_run,
    count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status IN ('failed','blocked','needs_review')) AS runs_needing_action_24h,
    count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status = 'success') AS runs_success_24h,
    1::int AS expected_runs_24h,
    86400::int AS expected_interval_sec
  FROM public.fever_sync_runs
),
fever_token_agg AS (
  SELECT
    'Fever (Token Refresh)'::text AS sync_name,
    max(last_token_refresh_at) AS last_run_at,
    CASE WHEN max(last_token_refresh_at) IS NULL THEN 'never' ELSE 'success' END AS last_run_status,
    NULL::int AS last_run_duration_sec,
    EXTRACT(EPOCH FROM (now() - max(last_token_refresh_at)))::int AS seconds_since_last_run,
    0::bigint AS runs_needing_action_24h,
    count(*) FILTER (WHERE last_token_refresh_at > now() - interval '24 hours')::bigint AS runs_success_24h,
    2::int AS expected_runs_24h,
    43200::int AS expected_interval_sec
  FROM public.fever_sync_config
  WHERE enabled = true
),
all_syncs AS (
  SELECT * FROM coala_agg
  UNION ALL SELECT * FROM fever_runs_agg
  UNION ALL SELECT * FROM fever_token_agg
)
SELECT
  sync_name,
  last_run_at,
  last_run_status,
  last_run_duration_sec,
  seconds_since_last_run,
  runs_needing_action_24h::int,
  runs_success_24h::int,
  expected_runs_24h,
  (seconds_since_last_run IS NOT NULL
    AND seconds_since_last_run > (expected_interval_sec * 1.5)::int) AS is_stale,
  CASE
    WHEN last_run_status IN ('failed','blocked','partial_failed','classify_failed','download_failed','parse_failed','import_failed')
      THEN 'critical'
    WHEN last_run_status = 'needs_review' THEN 'warning'
    WHEN runs_needing_action_24h > 0 THEN 'warning'
    WHEN seconds_since_last_run IS NOT NULL AND seconds_since_last_run > (expected_interval_sec * 1.5)::int THEN 'warning'
    ELSE 'ok'
  END AS health
FROM all_syncs;

GRANT SELECT ON public.vw_sync_health TO authenticated;

-- 3) Trigger function
CREATE OR REPLACE FUNCTION public.notify_sync_action_needed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync_type text;
  v_url text;
  v_label text;
  v_run_id uuid;
  v_config_id uuid;
  v_company_id uuid;
  v_user_ids uuid[];
  v_last_notified timestamptz;
  v_status text;
  v_supabase_url text := 'https://ukpuhoynrqobqtzdbysp.supabase.co';
  v_service_role text;
BEGIN
  v_status := NEW.status;

  IF v_status NOT IN ('failed','blocked','needs_review','partial_failed','classify_failed','download_failed','parse_failed','import_failed') THEN
    RETURN NEW;
  END IF;

  -- Só dispara se status MUDOU (em INSERT OLD é null)
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_run_id := NEW.id;
  v_config_id := NEW.config_id;
  v_company_id := NEW.company_id;

  IF TG_TABLE_NAME = 'coala_sync_runs' THEN
    v_sync_type := 'coala';
    v_url := '/admin/sync-coala';
    v_label := 'Coala';
  ELSIF TG_TABLE_NAME = 'fever_sync_runs' THEN
    v_sync_type := 'fever';
    v_url := '/admin/fever-sync';
    v_label := 'Fever';
  ELSE
    RETURN NEW;
  END IF;

  -- Anti-flood: 1h por (config_id, sync_type)
  SELECT last_notified_at INTO v_last_notified
  FROM public.sync_notifications_sent
  WHERE config_id = v_config_id AND sync_type = v_sync_type;

  IF v_last_notified IS NOT NULL AND v_last_notified > now() - interval '1 hour' THEN
    RETURN NEW;
  END IF;

  -- Resolver admin/manager/platform_admin da empresa
  SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin','manager','platform_admin')
    AND (v_company_id IS NULL OR p.company_id = v_company_id OR ur.role = 'platform_admin');

  IF v_user_ids IS NULL OR array_length(v_user_ids,1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Service role da vault
  SELECT decrypted_secret INTO v_service_role
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_service_role IS NULL THEN
    RAISE WARNING 'notify_sync_action_needed: service_role secret missing';
    RETURN NEW;
  END IF;

  -- HTTP POST
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_service_role
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_user_ids),
      'title', 'Sync precisa de atenção',
      'body', v_label || ': ' || v_status || ' — abrir admin',
      'url', v_url,
      'tag', 'sync-action-' || v_run_id::text
    )
  );

  -- Atualizar anti-flood
  INSERT INTO public.sync_notifications_sent (config_id, sync_type, last_notified_at)
  VALUES (v_config_id, v_sync_type, now())
  ON CONFLICT (config_id, sync_type)
  DO UPDATE SET last_notified_at = EXCLUDED.last_notified_at;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_sync_action_needed failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4) Triggers
DROP TRIGGER IF EXISTS trg_notify_sync_action_coala ON public.coala_sync_runs;
CREATE TRIGGER trg_notify_sync_action_coala
  AFTER INSERT OR UPDATE OF status ON public.coala_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.notify_sync_action_needed();

DROP TRIGGER IF EXISTS trg_notify_sync_action_fever ON public.fever_sync_runs;
CREATE TRIGGER trg_notify_sync_action_fever
  AFTER INSERT OR UPDATE OF status ON public.fever_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.notify_sync_action_needed();
