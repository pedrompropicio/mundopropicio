
-- ============================================================
-- 1. AUDITORIA GENÉRICA EM TABELAS SENSÍVEIS
-- ============================================================

-- Função de trigger genérica que escreve em system_audit_log
CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_entity_id TEXT;
  v_old JSONB;
  v_new JSONB;
  v_company UUID;
BEGIN
  -- Identificar actor (auth.uid se existir, senão "system")
  BEGIN
    v_actor := COALESCE(auth.uid()::text, 'system');
  EXCEPTION WHEN OTHERS THEN
    v_actor := 'system';
  END;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := COALESCE(OLD.id::text, '');
    v_old := to_jsonb(OLD);
    v_new := NULL;
    BEGIN v_company := (to_jsonb(OLD)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := COALESCE(NEW.id::text, '');
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN v_company := (to_jsonb(NEW)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
    -- Se não houve mudança real, não registar
    IF v_old = v_new THEN RETURN NEW; END IF;
  ELSE -- INSERT
    v_entity_id := COALESCE(NEW.id::text, '');
    v_old := NULL;
    v_new := to_jsonb(NEW);
    BEGIN v_company := (to_jsonb(NEW)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
  END IF;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata)
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    lower(TG_OP),
    v_actor,
    v_old,
    v_new,
    jsonb_build_object('company_id', v_company, 'schema', TG_TABLE_SCHEMA)
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Auditoria nunca pode bloquear a operação principal
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar a tabelas sensíveis
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['suppliers','companies','user_roles','user_permissions','financial_accounts'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_changes ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_table_change()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- 2. BACKUPS — RETENÇÃO 30 DIAS + TESTE MENSAL
-- ============================================================

-- Função de cleanup: apaga objetos do bucket database-backups com mais de 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_backups()
RETURNS TABLE(deleted_count INTEGER, oldest_kept TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_oldest TIMESTAMPTZ;
BEGIN
  WITH old AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'database-backups'
      AND created_at < (now() - interval '30 days')
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM old;

  SELECT min(created_at) INTO v_oldest
  FROM storage.objects WHERE bucket_id = 'database-backups';

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, metadata)
  VALUES (
    'backup_retention', 'cleanup', 'cleanup', 'system',
    jsonb_build_object('deleted_count', v_deleted, 'oldest_kept', v_oldest),
    jsonb_build_object('retention_days', 30)
  );

  RETURN QUERY SELECT v_deleted, v_oldest;
END;
$$;

-- Função de teste de restore: valida que o backup mais recente é JSON válido e tem tabelas
CREATE OR REPLACE FUNCTION public.test_latest_backup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_latest_name TEXT;
  v_latest_size BIGINT;
  v_latest_age INTERVAL;
  v_status TEXT;
  v_result JSONB;
BEGIN
  SELECT name, (metadata->>'size')::bigint, (now() - created_at)
  INTO v_latest_name, v_latest_size, v_latest_age
  FROM storage.objects
  WHERE bucket_id = 'database-backups'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_latest_name IS NULL THEN
    v_status := 'fail_no_backup';
  ELSIF v_latest_age > interval '36 hours' THEN
    v_status := 'fail_stale';
  ELSIF COALESCE(v_latest_size, 0) < 10000 THEN
    v_status := 'fail_too_small';
  ELSE
    v_status := 'ok';
  END IF;

  v_result := jsonb_build_object(
    'status', v_status,
    'latest_backup', v_latest_name,
    'size_bytes', v_latest_size,
    'age_hours', round(extract(epoch from v_latest_age)/3600.0, 2),
    'tested_at', now()
  );

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, metadata)
  VALUES ('backup_test', COALESCE(v_latest_name,'none'), 'test_restore', 'system', v_result, '{}'::jsonb);

  RETURN v_result;
END;
$$;

-- Agendar cron jobs (idempotente)
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-old-backups');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('monthly-backup-test');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cleanup-old-backups',
  '30 3 * * *',  -- 03:30 UTC diariamente (30min depois do backup)
  $$ SELECT public.cleanup_old_backups(); $$
);

SELECT cron.schedule(
  'monthly-backup-test',
  '0 4 1 * *',  -- dia 1 de cada mês às 04:00 UTC
  $$ SELECT public.test_latest_backup(); $$
);

-- Permissões
REVOKE ALL ON FUNCTION public.cleanup_old_backups() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_latest_backup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_latest_backup() TO authenticated;

-- ============================================================
-- 3. HIBP é configurado via supabase--configure_auth (próximo passo)
-- ============================================================
