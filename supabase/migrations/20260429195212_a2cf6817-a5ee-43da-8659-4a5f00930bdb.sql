CREATE OR REPLACE FUNCTION public.audit_generic_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id text;
  v_old jsonb;
  v_new jsonb;
  v_user text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_old := NULL;
    v_new := to_jsonb(NEW);
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    BEGIN v_entity_id := (OLD.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  END IF;

  BEGIN
    v_user := COALESCE(auth.uid()::text, 'system');
  EXCEPTION WHEN OTHERS THEN
    v_user := 'system';
  END;

  INSERT INTO public.system_audit_log (
    entity_type, entity_id, action, changed_by, old_data, new_data, metadata
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(v_entity_id, gen_random_uuid()::text),
    v_action,
    v_user,
    v_old,
    v_new,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'op', TG_OP)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.audit_generic_changes();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_generic_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_table_change() FROM PUBLIC, anon, authenticated;