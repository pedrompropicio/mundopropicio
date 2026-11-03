-- PREPARADO / NÃO EXECUTADO. Rodar apenas após instalação autorizada.
\set ON_ERROR_STOP on
DO $identities$
DECLARE r record; oid_found oid; acl_entry record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('public._ads486_fence(text)','3d3e8caf371a36efbdbceea2bc64a407',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_action']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_enter(uuid,text)','47763beb455fc5b8122f061f265a7001',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice','p_action']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_leave()','01cbb72ac92fedc1476de55c6f9b91c5',true,'sql','v',ARRAY['search_path=pg_catalog']::text[],false,false,'void',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_operation_tenant()','8bcb1f053fb84d5bb1671b09b2c12ab8',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_access(uuid)','b1a4448e29fc96446202e32f915ab28a',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_company']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_money(jsonb)','dfa8b1e290461e852bcae22d79cf8d34',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'numeric',false,false,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_decimal(numeric)','131fe9587065cdab7b8b877a96c9a728',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'text',false,true,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_uuid(jsonb)','d190b67276a1b9f7281b5fd1cb1b0619',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_keys(jsonb,text[],text[])','10ba464f855e19e1907bf3dd61f25a17',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'void',false,false,1,'''{}''::text[]',ARRAY['p_object','p_allowed','p_required']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_plan(uuid,jsonb)','2765b6c118814c9b3436ae321f7633f3',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_plan']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_policy(uuid)','adc0205392a1e219813afdef7ce8b536',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_company']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_financial_source(uuid)','ddec8e40e472bf09c3f0253198402678',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_no_duplicate(uuid)','a29b403affa83415d062feaf79883f8d',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_tiktok_proof(uuid)','7623a25f6042a12868124549578fdfc0',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_classify_tiktok(uuid)','a266cc909933c2b55bab9c88cf1a0fef',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_create_forecast(uuid,jsonb,text)','316632758f60dcebc21486c48ad25e2b',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_company','p_new','p_observation']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_preview(uuid)','f492bdfc4cbc8546339f900b74e8675a',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_task(uuid,text,bigint,uuid,jsonb)','e17c2ada734dbb6b80bcee16c7258625',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_action','p_revision','p_operation','p_resources']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_generation_v1(uuid,text,jsonb)','c84a72206abc75838a93fe2c6658b006',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,1,'''{}''::jsonb',ARRAY['p_invoice_id','p_action','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_reopen_v1(uuid,bigint)','0dd1c819b1a0c452245952d8852398da',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_expected_revision']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_line_identity(jsonb)','1b1f494d4d56dbf05cceaf6fe6e4adc0',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_line']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_import_v1(jsonb,jsonb)','d4e2d1ed0233d7577777f1c74927bf5d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_lines']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_documents(uuid,uuid,jsonb)','d5263b9b46c0bc0d86d75ab34976f945',false,'plpgsql','i',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'boolean',false,false,0,NULL::text,ARRAY['p_operation','p_company','p_documents']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_document_complete_v1(uuid,text,jsonb)','c3c55b670f8244d8294f619a64269b5d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_operation_id','p_task_key','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_source_attest_v1(uuid,bigint,jsonb)','94708f203014aad9e5557c94a86e4883',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_expected_revision','p_source']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_revert_v1(uuid,uuid,bigint)','15819b03a8e7def422b26b21f1813f0d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_operation_id','p_expected_revision']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_maintenance_v1(uuid,text,jsonb)','b9fa3f488cafe914f3512d4cf13edeb2',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_action','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_invoice_guard()','e529bb8cdd9d80b7448b31119df0aaf3',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_line_guard()','fc72daf5ed72a27a2e8c1312337be486',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_transaction_guard()','079e56553642d4bfbafe2d827d8f656a',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_forecast_guard()','3ffa6ddf92327cf5c3b3b66d967f5ca6',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_line_set_tour_split(uuid,jsonb)','ecba641ffe14c7cb199c5ba985944e6e',true,'plpgsql','v',ARRAY['search_path=public, pg_catalog']::text[],true,true,'jsonb',false,false,0,NULL::text,ARRAY['_line_id','_parts']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_line_is_pending(public.ads_invoice_line)','be4273290e0afc349dc1711a89d3ee5a',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true,'boolean',false,false,0,NULL::text,ARRAY['l']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_pending_counts(uuid[])','0252bc2d35269880d6b3e73a8adc9fd3',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true,'record',true,false,0,NULL::text,ARRAY['p_invoice_ids','invoice_id','total_lines','pending_lines']::text[],ARRAY['uuid[]','uuid','integer','integer']::text[],ARRAY['i','t','t','t']::text[]),
  ('public._ads486_catalog()','25955bb1612c73040d4d8931ffa4aef1',true,'sql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[])
 ) expected(signature,body_md5,secdef,language,volatility,config,authenticated_exec,service_exec,return_type,retset,strict,default_count,default_expression,argument_names,all_argument_types,argument_modes) LOOP
  oid_found:=to_regprocedure(r.signature);
  IF oid_found IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=oid_found AND md5(p.prosrc)=r.body_md5 AND p.prosecdef=r.secdef AND l.lanname=r.language
    AND p.provolatile::text=r.volatility AND p.proconfig IS NOT DISTINCT FROM r.config
    AND pg_get_userbyid(p.proowner)='postgres' AND format_type(p.prorettype,NULL)=r.return_type AND p.proretset=r.retset
    AND p.proisstrict=r.strict AND p.pronargdefaults=r.default_count
    AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM r.default_expression
    AND p.proargnames IS NOT DISTINCT FROM r.argument_names
    AND (SELECT array_agg(format_type(t,NULL) ORDER BY ord) FROM unnest(p.proallargtypes) WITH ORDINALITY q(t,ord)) IS NOT DISTINCT FROM r.all_argument_types
    AND p.proargmodes::text[] IS NOT DISTINCT FROM r.argument_modes
    AND p.prokind='f' AND p.proparallel='u' AND NOT p.proleakproof) THEN
   RAISE EXCEPTION '0305_function_identity: %',r.signature;
  END IF;
  IF has_function_privilege('anon',oid_found,'EXECUTE') OR
   has_function_privilege('authenticated',oid_found,'EXECUTE') IS DISTINCT FROM r.authenticated_exec OR
   has_function_privilege('service_role',oid_found,'EXECUTE') IS DISTINCT FROM r.service_exec THEN
   RAISE EXCEPTION '0305_effective_acl: %',r.signature;
  END IF;
  FOR acl_entry IN SELECT a.* FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=oid_found AND a.grantee<>p.proowner LOOP
   IF acl_entry.grantee=0 OR acl_entry.is_grantable OR NOT (
    (pg_get_userbyid(acl_entry.grantee)='authenticated' AND r.authenticated_exec) OR
    (pg_get_userbyid(acl_entry.grantee)='service_role' AND r.service_exec)) THEN
    RAISE EXCEPTION '0305_nominal_acl: %',r.signature;
   END IF;
  END LOOP;
 END LOOP;
END $identities$;

DO $$ DECLARE role_name text; BEGIN
 IF public._ads486_catalog() IS DISTINCT FROM (SELECT catalog FROM ads486_private.installation_manifest WHERE singleton) THEN
  RAISE EXCEPTION '0305_catalog_changed'; END IF;
 IF (SELECT count(*) FROM ads486_private.control)<>1 OR EXISTS(SELECT 1 FROM ads486_private.control WHERE enabled)
  OR EXISTS(SELECT 1 FROM ads486_private.command_context) THEN RAISE EXCEPTION '0305_not_closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.ads_invoice_generation_operation) OR EXISTS(SELECT 1 FROM public.ads_invoice WHERE
  generation_plan IS NOT NULL OR generation_contract_version IS NOT NULL OR generation_revision<>0 OR generation_cycle<>0
  OR source_file_sha256 IS NOT NULL OR source_attestation IS NOT NULL OR confirmed_revision IS NOT NULL
  OR confirmed_preview_hash IS NOT NULL OR generation_maintenance<>'[]'::jsonb) THEN RAISE EXCEPTION '0305_backfill'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(role_name,'ads486_private','USAGE') OR
   has_table_privilege(role_name,'public.ads_invoice_generation_operation','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION '0305_private_acl: %',role_name; END IF;
 END LOOP;
END $$;
-- Compare com o digest prévio; apenas as colunas novas são removidas.
SELECT count(*) invoice_count,md5(coalesce(jsonb_agg(to_jsonb(i)-ARRAY[
 'generation_revision','generation_cycle','generation_plan','generation_contract_version','source_file_sha256','source_attestation',
 'confirmed_revision','confirmed_preview_hash','generation_maintenance'] ORDER BY i.id)::text,'[]')) invoice_digest FROM public.ads_invoice i;
SELECT count(*) line_count,md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id)::text,'[]')) line_digest FROM public.ads_invoice_line l;
SELECT public._ads486_catalog();
SELECT * FROM ads486_private.preimages ORDER BY signature;
