-- D-ERP170 — JÁ APLICADO EM LIVE A 04/10/2026 PELO CHAT 2 (autorização do Pedro).
-- Registo idempotente (CREATE OR REPLACE) da versão em vigor, lida de pg_get_functiondef.
-- Correção: empresa já apagada → company_id NULL na auditoria (evita FK system_audit_log_company_id_fkey).
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

  -- D-ERP170: empresa já apagada (DELETE de companies ou cascata) → company_id NULL; o id fica em entity_id/old_data.
  IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company) THEN
    v_company := NULL;
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
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
