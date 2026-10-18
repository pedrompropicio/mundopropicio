-- #333 PENDENTE: controller review required. NOT registered/applied.
-- One immutable request conflict in check only. No settings, grants, rows or other errors changed.
-- Submit the complete SQL to the official migration tool only AFTER concrete review.
DO $migration$
DECLARE before_meta jsonb; after_meta jsonb; definition text; old_branch text := $old$IF p_hash IS DISTINCT FROM v.envelope_hash THEN RAISE EXCEPTION '#333: Hash divergente' USING ERRCODE=CASE WHEN p_action='check' THEN '42501' ELSE '40001' END; END IF;$old$; new_branch text := $new$IF p_hash IS DISTINCT FROM v.envelope_hash THEN RAISE EXCEPTION '#333: Hash divergente' USING ERRCODE='40001'; END IF;$new$;
BEGIN
 SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'secdef',prosecdef,'volatile',provolatile,'args',proargtypes::text,'return',prorettype,'lang',prolang) INTO before_meta FROM pg_proc WHERE oid='public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)'::regprocedure;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)'::regprocedure) <> 'b748a720b4cb1f988a927b5577e511dd' THEN RAISE EXCEPTION '#333: reviewed source differs; stop' USING ERRCODE='55000'; END IF;
 definition := pg_get_functiondef('public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)'::regprocedure);
 IF (length(definition)-length(replace(definition,old_branch,'')))/length(old_branch) <> 1 THEN RAISE EXCEPTION '#333: branch is not unique; stop' USING ERRCODE='55000'; END IF;
 EXECUTE replace(definition,old_branch,new_branch);
 SELECT jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'secdef',prosecdef,'volatile',provolatile,'args',proargtypes::text,'return',prorettype,'lang',prolang) INTO after_meta FROM pg_proc WHERE oid='public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)'::regprocedure;
 IF after_meta IS DISTINCT FROM before_meta THEN RAISE EXCEPTION '#333: function privileges/contract changed; rollback' USING ERRCODE='55000'; END IF;
END $migration$;
