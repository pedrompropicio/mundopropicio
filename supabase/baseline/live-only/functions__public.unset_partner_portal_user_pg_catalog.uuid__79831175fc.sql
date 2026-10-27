-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.unset_partner_portal_user(pg_catalog.uuid)
-- stage: historical
-- provenance: {"effective_at": "2026-09-14T13:54:36Z", "live_catalog_sha256": "ae7da78a114ce4f373a164c521c82adf6400ed6188f6104037fde73f0be12a5b", "live_definition_sha256": "2af0352329d27b180a5808142681d4dddfc9efa1a7ff8212acbc472d035a918a", "live_properties_sha256": "ae993f77c835f3eaf3de30b73ec32880a8cffc632745361bc00c5003dc08e83b", "oid": 223555, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "853d1e0d4c444992c76a2d4036feadc95d3e57f0c3f74a8d28ca6a000c9584a0", "window": {"at": 1789394076000}}
-- BEGIN OPERATION 21b72882901e002007b53cc36e3bb8e42a1dc488e5775622b5da09f3c325a092
CREATE OR REPLACE FUNCTION public.unset_partner_portal_user(_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _prof_company uuid;
  _old_supplier uuid;
  _caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.' USING ERRCODE = '42501';
  END IF;

  SELECT company_id, linked_supplier_id INTO _prof_company, _old_supplier
    FROM public.profiles WHERE id = _profile_id;
  IF _prof_company IS NULL THEN
    RAISE EXCEPTION 'Utilizador nao encontrado.' USING ERRCODE = '42704';
  END IF;

  IF NOT (public.is_platform_admin(auth.uid())
          OR (public.has_role(auth.uid(), 'admin'::app_role)
              AND EXISTS (SELECT 1 FROM public.profiles me
                          WHERE me.id = auth.uid() AND me.company_id = _prof_company))) THEN
    RAISE EXCEPTION 'Sem permissao para desligar utilizadores do Portal.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET linked_supplier_id = NULL WHERE id = _profile_id;

  SELECT email INTO _caller_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, company_id, metadata)
  VALUES ('partner_portal_link', COALESCE(_old_supplier, _profile_id), 'unlink',
          COALESCE(_caller_email, auth.uid()::text), _prof_company,
          jsonb_build_object('supplier_id', _old_supplier, 'profile_id', _profile_id,
                             'profile_email', (SELECT email FROM public.profiles WHERE id = _profile_id),
                             'caller_id', auth.uid()));

  RETURN _old_supplier;
END;
$function$

;

ALTER FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."unset_partner_portal_user"(uuid)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."unset_partner_portal_user"(_profile_id uuid) TO "service_role";
-- END OPERATION 21b72882901e002007b53cc36e3bb8e42a1dc488e5775622b5da09f3c325a092
