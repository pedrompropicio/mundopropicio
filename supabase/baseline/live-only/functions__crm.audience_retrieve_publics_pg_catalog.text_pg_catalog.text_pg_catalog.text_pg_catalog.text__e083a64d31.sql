-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:crm.audience_retrieve_publics(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8489e5f41a663cf8fad1cfb8df5c71500fdc43d45a00e183b14c5ad35e3b50c0", "live_properties_sha256": "5bbe2113e650b2018c6fb0f66d0e1985f76c9ff8f3f357f69cd0a76fe7769b55", "oid": 163582, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "05dfaf1add7fa204eecc09c03613595630a998fb4777eb26758c5e608cd6af8e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d556ec51c3e4923157e15dc697faef897cf8de2ea92ac2d2312152ad6d1adc25
CREATE OR REPLACE FUNCTION crm.audience_retrieve_publics(p_artist text DEFAULT NULL::text, p_music_style text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_market_scope text DEFAULT 'PT'::text)
 RETURNS TABLE(funil text, arquetipo text, n_adsets bigint, positivos bigint, roas_medio numeric, roas_max numeric, top_publicos text[])
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v_filtro text; v_alvo text;
begin
  if p_artist is not null and (
       select count(*) from crm.campaign_memory cm
       join crm.campaign_memory_element e on e.campaign_memory_id=cm.id
       where cm.market_scope=p_market_scope and cm.is_provisional=false and cm.artist=p_artist) >= 3 then
    v_filtro:='artist'; v_alvo:=p_artist;
  elsif p_music_style is not null then
    v_filtro:='music_style'; v_alvo:=p_music_style;
  elsif p_entity_type is not null then
    v_filtro:='entity_type'; v_alvo:=p_entity_type;
  else
    return;
  end if;

  return query execute format($q$
    select coalesce(cm.funnel_stage,'(sem funil)')::text,
           e.audience_archetype::text,
           count(*)::bigint,
           count(*) filter (where e.verdict='positivo')::bigint,
           round(avg(e.roas),2), round(max(e.roas),2),
           (array_agg(e.audience_key order by e.roas desc nulls last))[1:3]
    from crm.campaign_memory_element e
    join crm.campaign_memory cm on cm.id=e.campaign_memory_id
    where cm.market_scope=%L and cm.is_provisional=false and e.roas is not null and cm.%I=%L
    group by cm.funnel_stage, e.audience_archetype
    order by cm.funnel_stage, round(avg(e.roas),2) desc
  $q$, p_market_scope, v_filtro, v_alvo);
end;
$function$
;

ALTER FUNCTION crm.audience_retrieve_publics(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION d556ec51c3e4923157e15dc697faef897cf8de2ea92ac2d2312152ad6d1adc25
