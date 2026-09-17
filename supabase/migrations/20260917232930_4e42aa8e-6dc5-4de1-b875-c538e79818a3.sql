CREATE OR REPLACE FUNCTION public.backup_enqueue_slice(p_body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE k text; rid bigint;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  IF k IS NULL THEN RAISE EXCEPTION 'service role key indisponível'; END IF;
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/database-backup',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||k),
    body := p_body,
    timeout_milliseconds := 5000
  ) INTO rid;
  RETURN rid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backup_enqueue_slice(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backup_enqueue_slice(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_enqueue_slice(jsonb) TO service_role;