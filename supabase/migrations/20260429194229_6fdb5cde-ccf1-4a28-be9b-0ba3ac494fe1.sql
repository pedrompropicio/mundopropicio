CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor text := 'system';
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_entity_id text := '';
  v_action text;
  v_company uuid;
BEGIN
  BEGIN
    v_actor := COALESCE(auth.uid()::text, 'system');
  EXCEPTION WHEN OTHERS THEN
    v_actor := 'system';
  END;

  v_action := lower(TG_OP);

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_old := v_row;
    v_new := NULL;
  ELSE
    v_row := to_jsonb(NEW);
    v_new := v_row;
    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD);
      IF v_old = v_new THEN
        RETURN NEW;
      END IF;
    ELSE
      v_old := NULL;
    END IF;
  END IF;

  v_entity_id := COALESCE(v_row->>'id', '');

  BEGIN
    v_company := NULLIF(v_row->>'company_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_company := NULL;
  END;

  IF v_company IS NULL AND TG_TABLE_NAME = 'companies' AND TG_OP <> 'DELETE' THEN
    BEGIN
      v_company := NULLIF(v_row->>'id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_company := NULL;
    END;
  END IF;

  IF v_company IS NULL AND TG_TABLE_NAME <> 'companies' THEN
    BEGIN
      v_company := public.current_company_id();
    EXCEPTION WHEN OTHERS THEN
      v_company := NULL;
    END;
  END IF;

  INSERT INTO public.system_audit_log (
    entity_type,
    entity_id,
    action,
    changed_by,
    old_data,
    new_data,
    metadata,
    company_id
  ) VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    v_action,
    v_actor,
    v_old,
    v_new,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'trigger', TG_NAME,
      'operation', TG_OP
    ),
    v_company
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_table_change skipped audit for %.%: %', TG_TABLE_SCHEMA, TG_TABLE_NAME, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;