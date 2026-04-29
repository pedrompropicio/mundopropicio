
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
  v_default_company UUID;
BEGIN
  BEGIN v_actor := COALESCE(auth.uid()::text, 'system'); EXCEPTION WHEN OTHERS THEN v_actor := 'system'; END;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := COALESCE(OLD.id::text, '');
    v_old := to_jsonb(OLD); v_new := NULL;
    BEGIN v_company := (to_jsonb(OLD)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := COALESCE(NEW.id::text, '');
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    BEGIN v_company := (to_jsonb(NEW)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
    IF v_old = v_new THEN RETURN NEW; END IF;
  ELSE
    v_entity_id := COALESCE(NEW.id::text, '');
    v_old := NULL; v_new := to_jsonb(NEW);
    BEGIN v_company := (to_jsonb(NEW)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
  END IF;

  -- Garantir company_id (fallback para a default da app)
  IF v_company IS NULL THEN
    BEGIN v_company := public.current_company_id(); EXCEPTION WHEN OTHERS THEN v_company := NULL; END;
  END IF;
  IF v_company IS NULL THEN
    SELECT id INTO v_default_company FROM public.companies WHERE status='active' ORDER BY created_at LIMIT 1;
    v_company := v_default_company;
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES (TG_TABLE_NAME, v_entity_id, lower(TG_OP), v_actor, v_old, v_new,
            jsonb_build_object('schema', TG_TABLE_SCHEMA), v_company);
  EXCEPTION WHEN undefined_column THEN
    -- system_audit_log não tem company_id; tenta sem ele
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata)
    VALUES (TG_TABLE_NAME, v_entity_id, lower(TG_OP), v_actor, v_old, v_new,
            jsonb_build_object('schema', TG_TABLE_SCHEMA, 'company_id', v_company));
  WHEN OTHERS THEN NULL;
  END;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Igualmente corrigir as RPCs de backup
CREATE OR REPLACE FUNCTION public.cleanup_old_backups()
RETURNS TABLE(deleted_count INTEGER, oldest_kept TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
DECLARE v_deleted INTEGER := 0; v_oldest TIMESTAMPTZ; v_company UUID;
BEGIN
  WITH old AS (
    DELETE FROM storage.objects WHERE bucket_id='database-backups' AND created_at < (now() - interval '30 days')
    RETURNING 1
  ) SELECT count(*) INTO v_deleted FROM old;
  SELECT min(created_at) INTO v_oldest FROM storage.objects WHERE bucket_id='database-backups';
  SELECT id INTO v_company FROM public.companies WHERE status='active' ORDER BY created_at LIMIT 1;
  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, company_id)
    VALUES ('backup_retention','cleanup','cleanup','system',
            jsonb_build_object('deleted_count',v_deleted,'oldest_kept',v_oldest,'retention_days',30), v_company);
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data)
    VALUES ('backup_retention','cleanup','cleanup','system',
            jsonb_build_object('deleted_count',v_deleted,'oldest_kept',v_oldest,'retention_days',30));
  END;
  RETURN QUERY SELECT v_deleted, v_oldest;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_latest_backup()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
DECLARE v_name TEXT; v_size BIGINT; v_age INTERVAL; v_status TEXT; v_result JSONB; v_company UUID;
BEGIN
  SELECT name, (metadata->>'size')::bigint, (now()-created_at)
  INTO v_name, v_size, v_age
  FROM storage.objects WHERE bucket_id='database-backups'
  ORDER BY created_at DESC LIMIT 1;

  v_status := CASE
    WHEN v_name IS NULL THEN 'fail_no_backup'
    WHEN v_age > interval '36 hours' THEN 'fail_stale'
    WHEN COALESCE(v_size,0) < 10000 THEN 'fail_too_small'
    ELSE 'ok' END;

  v_result := jsonb_build_object('status',v_status,'latest_backup',v_name,'size_bytes',v_size,
                                 'age_hours', round(extract(epoch from v_age)/3600.0,2),'tested_at',now());

  SELECT id INTO v_company FROM public.companies WHERE status='active' ORDER BY created_at LIMIT 1;
  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, company_id)
    VALUES ('backup_test', COALESCE(v_name,'none'),'test_restore','system', v_result, v_company);
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data)
    VALUES ('backup_test', COALESCE(v_name,'none'),'test_restore','system', v_result);
  END;
  RETURN v_result;
END;
$$;
