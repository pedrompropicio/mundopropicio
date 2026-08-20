-- VIP coupon e-mails: log de idempotência + trigger imediato + cron de lembrete.

CREATE TABLE IF NOT EXISTS public.vip_coupon_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  email text NOT NULL,
  lead_id uuid NULL,
  type text NOT NULL CHECK (type IN ('immediate','reminder')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, email, type)
);

COMMENT ON TABLE public.vip_coupon_email_log IS
  'Idempotência dos e-mails de cupom VIP. Escrito apenas pela edge function vip-coupon-email (service_role).';

GRANT ALL ON public.vip_coupon_email_log TO service_role;

ALTER TABLE public.vip_coupon_email_log ENABLE ROW LEVEL SECURITY;
-- Sem policies: sem acesso via Data API (service_role ignora RLS).

CREATE INDEX IF NOT EXISTS vip_coupon_email_log_event_type_idx
  ON public.vip_coupon_email_log (event_id, type);

-- Base URL das edge functions (env-agnóstico via public.app_secrets)
CREATE OR REPLACE FUNCTION public.vip_coupon_functions_base_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_secrets WHERE name = 'project_functions_base_url' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.vip_coupon_functions_base_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vip_coupon_functions_base_url() FROM anon;
REVOKE ALL ON FUNCTION public.vip_coupon_functions_base_url() FROM authenticated;

INSERT INTO public.app_secrets (name, value, description)
VALUES (
  'project_functions_base_url',
  'https://ukpuhoynrqobqtzdbysp.supabase.co',
  'Base URL das edge functions deste ambiente (usada por triggers/crons).'
)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_vip_coupon_email_immediate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_key text;
BEGIN
  IF NEW.source IS NULL OR NEW.source NOT LIKE 'vip%' THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.consent_email, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_base := public.vip_coupon_functions_base_url();
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trg_vip_coupon_email_immediate: base_url ou service_role secret em falta — e-mail nao disparado (lead %)', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_base || '/functions/v1/vip-coupon-email?mode=immediate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'immediate', 'lead_id', NEW.id),
    timeout_milliseconds := 30000
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vip_coupon_email_after_insert ON public.lead_capture;
CREATE TRIGGER vip_coupon_email_after_insert
AFTER INSERT ON public.lead_capture
FOR EACH ROW
EXECUTE FUNCTION public.trg_vip_coupon_email_immediate();

CREATE OR REPLACE FUNCTION public.run_vip_coupon_reminder()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_key text;
  v_req bigint;
BEGIN
  v_base := public.vip_coupon_functions_base_url();
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'run_vip_coupon_reminder: base_url ou service_role secret em falta';
    RETURN jsonb_build_object('error', 'config_missing');
  END IF;

  SELECT net.http_post(
    url := v_base || '/functions/v1/vip-coupon-email?mode=reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'reminder'),
    timeout_milliseconds := 30000
  ) INTO v_req;

  RETURN jsonb_build_object('request_id', v_req, 'ts', now());
END $$;

REVOKE ALL ON FUNCTION public.run_vip_coupon_reminder() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_vip_coupon_reminder() FROM anon;
REVOKE ALL ON FUNCTION public.run_vip_coupon_reminder() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vip-coupon-reminder-daily') THEN
      PERFORM cron.unschedule('vip-coupon-reminder-daily');
    END IF;
    PERFORM cron.schedule(
      'vip-coupon-reminder-daily',
      '30 8 * * *',
      'SELECT public.run_vip_coupon_reminder();'
    );
  END IF;
END $$;