-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.ensure_camarim_advance_account()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "08c785ab81239b30835c9f7759e538f99eb0da64aaaeab674b263bfc79761253", "live_properties_sha256": "420ac7212a9600b512dea4cbc6184fa9512c1d4edb299785f631cf72572dd073", "oid": 173434, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "a5299185d23260de9e0b86b9d8e39b54119f8ddf5ebdd4ef8f5a21aa7f5bf8e2", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8b14c9cb1fdd53c2e670cee0326d147cdcfdbabf4f7e09d9c44691e07cc32472
CREATE OR REPLACE FUNCTION public.ensure_camarim_advance_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acc_id uuid;
  v_name text;
BEGIN
  IF NEW.advance_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_name := 'Camarim · ' || COALESCE(NEW.title, NEW.id::text);

  INSERT INTO public.financial_accounts (
    name, type, description, initial_balance,
    is_active, balance_visible_to_all, is_hidden,
    skip_balance_check, company_id
  ) VALUES (
    left(v_name, 200),
    'camarim_session',
    'Conta-corrente automática da sessão de camarim ' || NEW.id::text,
    0,
    true,
    false,
    true,        -- oculta dos seletores globais
    true,        -- não bloquear por saldo negativo temporário
    NEW.company_id
  )
  RETURNING id INTO v_acc_id;

  NEW.advance_account_id := v_acc_id;
  RETURN NEW;
END;
$function$
;

ALTER FUNCTION public.ensure_camarim_advance_account() OWNER TO "postgres";
-- END OPERATION 8b14c9cb1fdd53c2e670cee0326d147cdcfdbabf4f7e09d9c44691e07cc32472
