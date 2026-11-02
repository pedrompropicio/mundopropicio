-- PREPARADO / NÃO EXECUTADO. Rodar apenas após instalação autorizada.
\set ON_ERROR_STOP on
DO $identities$
DECLARE r record; oid_found oid; acl_entry record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('public._ads486_fence()','171cb9b5c32ed535b9bd8a96f1548db6',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public._ads486_enter(uuid,text)','47763beb455fc5b8122f061f265a7001',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public._ads486_leave()','01cbb72ac92fedc1476de55c6f9b91c5',true,'sql','v',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public._ads486_operation_tenant()','8bcb1f053fb84d5bb1671b09b2c12ab8',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public._ads486_access(uuid)','b1a4448e29fc96446202e32f915ab28a',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public._ads486_money(jsonb)','dfa8b1e290461e852bcae22d79cf8d34',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public._ads486_decimal(numeric)','131fe9587065cdab7b8b877a96c9a728',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public._ads486_uuid(jsonb)','d190b67276a1b9f7281b5fd1cb1b0619',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public._ads486_keys(jsonb,text[],text[])','10ba464f855e19e1907bf3dd61f25a17',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public._ads486_plan(uuid,jsonb)','1ce5ad12ed7eb95daeec2deb23b30cfb',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public._ads486_policy(uuid)','adc0205392a1e219813afdef7ce8b536',true,'plpgsql','s',ARRAY[]::text[],false,false),
  ('public._ads486_financial_source(uuid)','8c559c9bca1338c681c4b961d9b0f0f4',true,'plpgsql','s',ARRAY[]::text[],false,false),
  ('public._ads486_no_duplicate(uuid)','a29b403affa83415d062feaf79883f8d',true,'plpgsql','s',ARRAY[]::text[],false,false),
  ('public._ads486_tiktok_proof(uuid)','f1eb148370806530059d56142a043e7f',true,'plpgsql','s',ARRAY[]::text[],false,false),
  ('public._ads486_classify_tiktok(uuid)','a266cc909933c2b55bab9c88cf1a0fef',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public._ads486_create_forecast(uuid,jsonb,text)','316632758f60dcebc21486c48ad25e2b',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public._ads486_preview(uuid)','49656a757c8bfa82c7295bfe43df813c',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public.ads_invoice_generation_v1(uuid,text,jsonb)','ce1cad8a3efec92e94438609fe51455a',true,'plpgsql','v',ARRAY[]::text[],true,false),
  ('public.ads_invoice_reopen_v1(uuid,bigint)','240582724bc93d16bf71a196c08938d0',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false),
  ('public._ads486_line_identity(jsonb)','1b1f494d4d56dbf05cceaf6fe6e4adc0',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false),
  ('public.ads_invoice_import_v1(jsonb,jsonb)','12ba510bef29ab9946e73cfb5a695aad',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false),
  ('public._ads486_documents(uuid,uuid,jsonb)','d5263b9b46c0bc0d86d75ab34976f945',false,'plpgsql','i',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false),
  ('public.ads_invoice_document_complete_v1(uuid,text,jsonb)','f9d2eb6a3d0bcb294ab11a7800b604c8',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true),
  ('public.ads_invoice_source_attest_v1(uuid,bigint,jsonb)','221180e88e5fad03aef8966cbdf1085e',true,'plpgsql','v',ARRAY[]::text[],false,true),
  ('public.ads_invoice_revert_v1(uuid,uuid,bigint)','94b9a2daa0d412c7f19c01e5f025f9d6',true,'plpgsql','v',ARRAY[]::text[],true,false),
  ('public._ads486_invoice_guard()','bb85f9e27cb008a9a2c4662b93daf513',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public._ads486_line_guard()','fc72daf5ed72a27a2e8c1312337be486',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public._ads486_transaction_guard()','079e56553642d4bfbafe2d827d8f656a',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public._ads486_forecast_guard()','3ffa6ddf92327cf5c3b3b66d967f5ca6',true,'plpgsql','v',ARRAY[]::text[],false,false),
  ('public.ads_invoice_line_set_tour_split(uuid,jsonb)','ecba641ffe14c7cb199c5ba985944e6e',true,'plpgsql','v',ARRAY['search_path=public, pg_catalog']::text[],true,true),
  ('public.ads_invoice_line_is_pending(public.ads_invoice_line)','be4273290e0afc349dc1711a89d3ee5a',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true),
  ('public.ads_invoice_pending_counts(uuid[])','0252bc2d35269880d6b3e73a8adc9fd3',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true),
  ('public._ads486_catalog()','ee4ac54b6e421bb203838d09acd279e8',true,'sql','s',ARRAY[]::text[],false,false)
 ) expected(signature,body_md5,secdef,language,volatility,config,authenticated_exec,service_exec) LOOP
  oid_found:=to_regprocedure(r.signature);
  IF oid_found IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=oid_found AND md5(p.prosrc)=r.body_md5 AND p.prosecdef=r.secdef AND l.lanname=r.language
    AND p.provolatile::text=r.volatility AND p.proconfig IS NOT DISTINCT FROM r.config
    AND pg_get_userbyid(p.proowner)='postgres') THEN
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
