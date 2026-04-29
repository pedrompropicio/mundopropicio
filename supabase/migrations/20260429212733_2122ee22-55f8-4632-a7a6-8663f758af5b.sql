CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_entity_id text;
  v_old jsonb;
  v_new jsonb;
  v_user text;
  v_company uuid;
  v_row jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_row := v_new;
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_row := v_old;
    BEGIN v_entity_id := (OLD.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  END IF;

  BEGIN
    v_user := COALESCE(auth.uid()::text, 'system');
  EXCEPTION WHEN OTHERS THEN
    v_user := 'system';
  END;

  -- Resolver company_id de forma robusta:
  -- 1) Se a tabela é `companies`, usa o id da própria empresa (a auditoria pertence-lhe).
  -- 2) Senão, tenta a current_company_id() do utilizador autenticado.
  -- 3) Senão, tenta extrair `company_id` da própria linha.
  IF TG_TABLE_NAME = 'companies' THEN
    v_company := COALESCE(NULLIF(v_row->>'id','')::uuid, NULL);
  ELSE
    BEGIN
      v_company := current_company_id();
    EXCEPTION WHEN OTHERS THEN
      v_company := NULL;
    END;
    IF v_company IS NULL THEN
      BEGIN
        v_company := NULLIF(v_row->>'company_id','')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_company := NULL;
      END;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (
      entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id
    ) VALUES (
      TG_TABLE_NAME,
      COALESCE(v_entity_id, gen_random_uuid()::text),
      v_action,
      v_user,
      v_old,
      v_new,
      jsonb_build_object('schema', TG_TABLE_SCHEMA, 'op', TG_OP),
      v_company
    );
  EXCEPTION WHEN not_null_violation THEN
    -- Última defesa: nunca bloquear a operação principal por falha de auditoria.
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;