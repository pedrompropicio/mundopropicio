-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.log_table_change()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "575d25380cdeb3a7d907d7b311c254a8a1f549ec9aa1aeb00fa3641f11748f8d", "live_properties_sha256": "2892ef459a24ce88a90b774901cff4a8dd57ff605beeabd26f22ea8cef10bf23", "oid": 56323, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "2c42a6d3c8851e636a2f4b6aaabe9a772f790445cac07fcd5488769fc38eb129", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 04941760187aedf5db8331c688c01d8cae39dcd9347a7675e3837ed9d3bca5e2
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
    -- Última defesa: nunca bloquear a operação principal por falha de auditoria.
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$
;

ALTER FUNCTION public.log_table_change() OWNER TO "postgres";
-- END OPERATION 04941760187aedf5db8331c688c01d8cae39dcd9347a7675e3837ed9d3bca5e2
