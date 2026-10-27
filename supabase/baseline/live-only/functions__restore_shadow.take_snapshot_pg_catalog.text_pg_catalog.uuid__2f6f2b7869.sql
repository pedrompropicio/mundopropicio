-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:restore_shadow.take_snapshot(pg_catalog.text,pg_catalog.uuid)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8b953b2e6f8cb30deb17d6c5a92beaaf55a6d2e42ef9f3e924bf60b99987e433", "live_properties_sha256": "dce2fc2b51de29a47a9d1c43324cca6675ddd8b17b32f8444ca38bdc8dae0176", "oid": 232389, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d4a7526206d7fdf80bceeb2fcf2e2229b10d9fc42e238b17e78d84f15a5309b5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b43ec8f1ae83c86153af393fdc1bc3b5529a896efa89bd22eb0a8ddf8fe72b56
CREATE OR REPLACE FUNCTION restore_shadow.take_snapshot(p_label text, p_company uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'restore_shadow', 'public', 'pg_temp'
AS $function$
declare r record; v_n bigint; v_hash text; c int := 0;
begin
  delete from restore_shadow._snapshot where label = p_label;
  for r in
    select n.nspname::text as sch, cl.relname::text as tbl
    from pg_class cl join pg_namespace n on n.oid=cl.relnamespace
    where n.nspname in ('public','crm') and cl.relkind in ('r','p')
      and not cl.relispartition and cl.relname <> 'backup_runs'
      and exists (select 1 from pg_attribute a where a.attrelid=cl.oid
                  and a.attname='company_id' and a.attnum>0 and not a.attisdropped)
    order by 1,2
  loop
    execute format(
      'select count(*), md5(coalesce(string_agg(j,''|'' order by j),'''')) from (select row_to_json(x)::text as j from %I.%I x where company_id = $1) s',
      r.sch, r.tbl) into v_n, v_hash using p_company;
    insert into restore_shadow._snapshot(label, tbl, n, hash)
    values (p_label, case when r.sch='crm' then 'crm.'||r.tbl else r.tbl end, v_n, v_hash);
    c := c + 1;
  end loop;
  return c;
end $function$
;

ALTER FUNCTION restore_shadow.take_snapshot(pg_catalog.text,pg_catalog.uuid) OWNER TO "postgres";
-- END OPERATION b43ec8f1ae83c86153af393fdc1bc3b5529a896efa89bd22eb0a8ddf8fe72b56
