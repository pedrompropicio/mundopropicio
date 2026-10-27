-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:crm.audience_retrieve(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.int4)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2b6339692925c0d8f042df1d344dab5e1e2d8cf41fcfd108b87c434ef5f975ea", "live_properties_sha256": "ca16c8406ddd89f5a9ec52f40b941757c22d80584115706404e489454ef9e4c7", "oid": 163544, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "de463f3fd1d9ea45c07d9e6d47983b93f15e09378fb0656debd8b13a9a2dcb8e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3d2f4ca80176fe235fd53faff9487b1cf708614925713162cdc698b090ffa25b
CREATE OR REPLACE FUNCTION crm.audience_retrieve(p_artist text DEFAULT NULL::text, p_music_style text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_market_scope text DEFAULT 'PT'::text, p_min_campaigns integer DEFAULT 3)
 RETURNS TABLE(nivel_evidencia text, alvo text, funil text, n_campanhas bigint, positivas bigint, fracas bigint, roas_medio numeric, roas_min numeric, roas_max numeric, spend_medio_eur numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v_nivel text; v_alvo text; v_filtro text;
begin
  if p_artist is not null and (
       select count(*) from crm.campaign_memory
       where market_scope=p_market_scope and is_provisional=false and roas is not null
         and artist=p_artist) >= p_min_campaigns then
    v_nivel:='artista'; v_alvo:=p_artist; v_filtro:='artist';
  elsif p_music_style is not null and (
       select count(*) from crm.campaign_memory
       where market_scope=p_market_scope and is_provisional=false and roas is not null
         and music_style=p_music_style) >= p_min_campaigns then
    v_nivel:='estilo'; v_alvo:=p_music_style; v_filtro:='music_style';
  elsif p_entity_type is not null then
    v_nivel:='tipo'; v_alvo:=p_entity_type; v_filtro:='entity_type';
  else
    return query select 'sem_evidencia'::text, null::text, null::text,
                        0::bigint,0::bigint,0::bigint,null::numeric,null::numeric,null::numeric,null::numeric;
    return;
  end if;

  return query execute format($q$
    select %L::text, %L::text, coalesce(funnel_stage,'(sem funil)')::text,
           count(*)::bigint,
           count(*) filter (where verdict='positivo')::bigint,
           count(*) filter (where verdict='fraco')::bigint,
           round(avg(roas),2), round(min(roas),2), round(max(roas),2),
           round(avg(spend_cents)/100.0)
    from crm.campaign_memory
    where market_scope=%L and is_provisional=false and roas is not null and %I=%L
    group by funnel_stage order by 3
  $q$, v_nivel, v_alvo, p_market_scope, v_filtro, v_alvo);
end;
$function$
;

ALTER FUNCTION crm.audience_retrieve(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.int4) OWNER TO "postgres";
-- END OPERATION 3d2f4ca80176fe235fd53faff9487b1cf708614925713162cdc698b090ffa25b
