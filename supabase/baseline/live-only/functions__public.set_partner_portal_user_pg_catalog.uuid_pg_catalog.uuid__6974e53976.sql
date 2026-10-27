-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.set_partner_portal_user(pg_catalog.uuid,pg_catalog.uuid)
-- stage: historical
-- provenance: {"effective_at": "2026-09-14T13:54:34Z", "live_catalog_sha256": "63b6336fb05ae9daf741753f7d9c2c1fba5c00b76ba14988c7d5ec7a6b08df0b", "live_definition_sha256": "c1f1ac387fac3c093dd2e39544ae8e30f0aeec02e26b4b63a646254058645cc7", "live_properties_sha256": "f436c52d6ca1572f16e5d7e6ec06b405173f6adab8ab7cc99cf12e928fbca128", "oid": 223407, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "46233a9034e02fbd415b0a89d0f419fff5d3eb6b5bec8ffc34635ea2df01cd20", "window": {"at": 1789394074000}}
-- BEGIN OPERATION f0421c4b2143061ae0af8870cadd85fd9724ffc3997a2d11fcd889a90b1dd76f
CREATE OR REPLACE FUNCTION public.set_partner_portal_user(_supplier_id uuid, _profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sup_company uuid;
  _prof_company uuid;
  _caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO _sup_company FROM public.suppliers WHERE id = _supplier_id;
  IF _sup_company IS NULL THEN
    RAISE EXCEPTION 'Entidade nao encontrada.' USING ERRCODE = '42704';
  END IF;

  IF NOT (public.is_platform_admin(auth.uid())
          OR (public.has_role(auth.uid(), 'admin'::app_role)
              AND EXISTS (SELECT 1 FROM public.profiles me
                          WHERE me.id = auth.uid() AND me.company_id = _sup_company))) THEN
    RAISE EXCEPTION 'Sem permissao para ligar utilizadores do Portal.' USING ERRCODE = '42501';
  END IF;

  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Indique o utilizador a ligar ou a desligar.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO _prof_company FROM public.profiles WHERE id = _profile_id;
  IF _prof_company IS NULL THEN
    RAISE EXCEPTION 'Utilizador nao encontrado.' USING ERRCODE = '42704';
  END IF;
  IF _prof_company IS DISTINCT FROM _sup_company THEN
    RAISE EXCEPTION 'Utilizador e entidade pertencem a empresas diferentes.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = _profile_id AND ur.role = 'partner'::app_role) THEN
    RAISE EXCEPTION 'So utilizadores com perfil de parceiro podem ser ligados a um socio.' USING ERRCODE = '42501';
  END IF;

  -- Um sócio tem N representantes. Ligar um utilizador NUNCA desliga outro:
  -- a ligação é do utilizador, e cada utilizador representa um sócio.
  UPDATE public.profiles SET linked_supplier_id = _supplier_id WHERE id = _profile_id;

  SELECT email INTO _caller_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, company_id, metadata)
  VALUES ('partner_portal_link', _supplier_id, 'link',
          COALESCE(_caller_email, auth.uid()::text), _sup_company,
          jsonb_build_object('supplier_id', _supplier_id, 'profile_id', _profile_id,
                             'profile_email', (SELECT email FROM public.profiles WHERE id = _profile_id),
                             'caller_id', auth.uid()));

  RETURN _profile_id;
END;
$function$

;

ALTER FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."set_partner_portal_user"(uuid, uuid)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_partner_portal_user"(_supplier_id uuid, _profile_id uuid) TO "service_role";
-- END OPERATION f0421c4b2143061ae0af8870cadd85fd9724ffc3997a2d11fcd889a90b1dd76f
