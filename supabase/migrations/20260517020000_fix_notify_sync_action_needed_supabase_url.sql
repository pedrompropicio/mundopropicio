-- Corrige URL Supabase stale (ukpuhoynrqobqtzdbysp → sfohvvlqccmmebvjgibx).
-- Bug descoberto em 17/05/2026: a função criada em 20260516042414 tem
-- hard-coded o project_id antigo de TEST. Push notifications de sync
-- failures Coala/Fever nunca foram entregues desde 16/05 (catch
-- EXCEPTION WHEN OTHERS THEN RAISE WARNING — erro silencioso).

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
  v_supabase_url text := 'https://sfohvvlqccmmebvjgibx.supabase.co';
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
