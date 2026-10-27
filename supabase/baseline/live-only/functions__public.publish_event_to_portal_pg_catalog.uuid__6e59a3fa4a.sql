-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.publish_event_to_portal(pg_catalog.uuid)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:35Z", "live_catalog_sha256": "174ce95cadd6e1fc4b5f905e79858ff97cb52a5bc02c5fd2af2cce87912d0258", "live_definition_sha256": "6adecd64b1626592517582955ddabf1752df991c5943008abd4ee670db9a23f7", "live_properties_sha256": "73fedf1db70cbcdeb4d74534333d8b458bb74e96a4503f4d9cb4f332af8aa5f5", "oid": 170936, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "a95d8e1157346fd523230a5d16578c67b08aae6338f5a9a1361a15d84b44dcd9", "window": {"at": 1782869075000}}
-- BEGIN OPERATION c9cb51ef9c903b7fa5f07e3a0eddb499ed86a17e4e90ab8af298ca1246ca4094
CREATE OR REPLACE FUNCTION public.publish_event_to_portal(p_event_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, portal_visible boolean)
 LANGUAGE plpgsql
AS $function$
declare v_type text; v_name text; v_slug text; v_mother_slug text; r record; v_city text; v_base text;
begin
  select e.event_type, e.name, e.slug into v_type, v_name, v_slug
  from public.events e where e.id = p_event_id;
  if not found then raise exception 'Evento % não encontrado', p_event_id; end if;

  if v_slug is null or v_slug = '' then
    v_slug := public.unique_event_slug(public.slugify(v_name), p_event_id);
  end if;
  update public.events set slug = v_slug, portal_visible = true where events.id = p_event_id;
  v_mother_slug := v_slug;

  if v_type = 'multi_day' then
    for r in select e.id, e.name, e.slug, e.city_id from public.events e where e.parent_event_id = p_event_id loop
      if r.slug is null or r.slug = '' then
        select c.name into v_city from public.cities c where c.id = r.city_id;
        v_base := v_mother_slug || '-' || public.slugify(coalesce(v_city, r.name));
        update public.events set slug = public.unique_event_slug(v_base, r.id), portal_visible = true where events.id = r.id;
      else
        update public.events set portal_visible = true where events.id = r.id;
      end if;
    end loop;
  end if;

  return query
    select e.id, e.name, e.slug, e.portal_visible
    from public.events e
    where e.id = p_event_id or e.parent_event_id = p_event_id
    order by e.parent_event_id nulls first, e.date;
end $function$

;

ALTER FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."publish_event_to_portal"(uuid)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."publish_event_to_portal"(p_event_id uuid) TO "service_role";
-- END OPERATION c9cb51ef9c903b7fa5f07e3a0eddb499ed86a17e4e90ab8af298ca1246ca4094
