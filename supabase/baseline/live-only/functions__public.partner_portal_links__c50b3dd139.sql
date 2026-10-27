-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.partner_portal_links()
-- stage: historical
-- provenance: {"effective_at": "2026-09-14T13:54:35Z", "live_catalog_sha256": "3e7c75888ea90b6a4143bbb86feec8f87c30adc25b26e7219b9fe6599b871f94", "live_definition_sha256": "018f4637eb3453c222a9fc876a8cb8f21c2526ff324f3e078736162272ff13cc", "live_properties_sha256": "e8b70e54d2bcc2a9e123f8fd8fa524b53a93d6a5facaa1955f29326b3b5d03e9", "oid": 223408, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "8bfea49438d7f0842beacb2cd3560badb88f4c6347af7974b23bc8caeaac0675", "window": {"at": 1789394075000}}
-- BEGIN OPERATION a4eb1e422a0ade1c08adec2cb5b7f16b2a970a5d398466fcc5c7128fb4580912
CREATE OR REPLACE FUNCTION public.partner_portal_links()
 RETURNS TABLE(profile_id uuid, full_name text, email text, supplier_id uuid, supplier_name text, link_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO _company FROM public.profiles WHERE id = auth.uid();

  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissao.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         r.sid,
         s.name,
         CASE WHEN r.sid IS NULL THEN NULL
              WHEN p.linked_supplier_id IS NOT NULL THEN 'link'
              ELSE 'email' END
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'partner'::app_role
  CROSS JOIN LATERAL (SELECT public.user_supplier_id(p.id) AS sid) r
  LEFT JOIN public.suppliers s ON s.id = r.sid
  WHERE public.is_platform_admin(auth.uid()) OR p.company_id = _company
  ORDER BY p.full_name NULLS LAST;
END;
$function$

;

ALTER FUNCTION "public"."partner_portal_links"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."partner_portal_links"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."partner_portal_links"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."partner_portal_links"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."partner_portal_links"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."partner_portal_links"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."partner_portal_links"() TO "service_role";
-- END OPERATION a4eb1e422a0ade1c08adec2cb5b7f16b2a970a5d398466fcc5c7128fb4580912
