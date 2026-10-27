-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.unpublish_event_from_portal(pg_catalog.uuid)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:36Z", "live_catalog_sha256": "4fa18c29f26793f10c1487052150977bfe5135f56a317349fe1aeac76c092c9c", "live_definition_sha256": "6980d7eebef91ca61569b9e29e9b221649f792c1331ddbf973da19ceaeb6a938", "live_properties_sha256": "b6bd750bf5882b72a8f4e3db061531f1b4aee9e7f17ebedee4bacb50f8ee8d44", "oid": 170937, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "1adb9ce4e5c65a640b46b6a325074231a323a2f7c3ef435e14bbd28e967a3900", "window": {"at": 1782869076000}}
-- BEGIN OPERATION 833a48b23d15c0976504370e72d815b24cb43e761a9b7b54640fd6636b32f10e
CREATE OR REPLACE FUNCTION public.unpublish_event_from_portal(p_event_id uuid)
 RETURNS TABLE(id uuid, name text, portal_visible boolean)
 LANGUAGE plpgsql
AS $function$
declare v_type text;
begin
  select e.event_type into v_type from public.events e where e.id = p_event_id;
  if not found then raise exception 'Evento % não encontrado', p_event_id; end if;
  update public.events set portal_visible = false where events.id = p_event_id;
  if v_type = 'multi_day' then
    update public.events set portal_visible = false where events.parent_event_id = p_event_id;
  end if;
  return query
    select e.id, e.name, e.portal_visible
    from public.events e
    where e.id = p_event_id or e.parent_event_id = p_event_id
    order by e.parent_event_id nulls first, e.date;
end $function$

;

ALTER FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."unpublish_event_from_portal"(uuid)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."unpublish_event_from_portal"(p_event_id uuid) TO "service_role";
-- END OPERATION 833a48b23d15c0976504370e72d815b24cb43e761a9b7b54640fd6636b32f10e
