CREATE OR REPLACE FUNCTION crm.audience_retrieve(
  p_artist text DEFAULT NULL,
  p_music_style text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_market_scope text DEFAULT 'PT',
  p_min_campaigns integer DEFAULT 3,
  p_music_styles text[] DEFAULT NULL
)
RETURNS TABLE(nivel_evidencia text, alvo text, funil text, n_campanhas bigint, positivas bigint, fracas bigint, roas_medio numeric, roas_min numeric, roas_max numeric, spend_medio_eur numeric)
LANGUAGE plpgsql
STABLE
AS $function$
declare
  v_styles text[];
  v_artist_count bigint := 0;
  v_style_count bigint := 0;
begin
  if p_music_styles is not null and array_length(p_music_styles, 1) > 0 then
    v_styles := p_music_styles;
  elsif p_music_style is not null then
    v_styles := array[p_music_style];
  else
    v_styles := null;
  end if;

  if p_artist is not null then
    select count(*) into v_artist_count from crm.campaign_memory
    where market_scope = p_market_scope and is_provisional = false and roas is not null
      and artist = p_artist;
  end if;

  if v_styles is not null then
    select count(*) into v_style_count from crm.campaign_memory
    where market_scope = p_market_scope and is_provisional = false and roas is not null
      and music_style = ANY(v_styles);
  end if;

  if p_artist is not null and v_artist_count >= p_min_campaigns then
    return query
    select 'artista'::text, p_artist::text, coalesce(funnel_stage,'(sem funil)')::text,
           count(*)::bigint,
           count(*) filter (where verdict='positivo')::bigint,
           count(*) filter (where verdict='fraco')::bigint,
           round(avg(roas),2), round(min(roas),2), round(max(roas),2),
           round(avg(spend_cents)/100.0)
    from crm.campaign_memory
    where market_scope = p_market_scope and is_provisional = false and roas is not null
      and artist = p_artist
    group by funnel_stage order by 3;
    return;
  elsif v_styles is not null and v_style_count >= p_min_campaigns then
    return query
    select 'estilo'::text, array_to_string(v_styles, '+')::text, coalesce(funnel_stage,'(sem funil)')::text,
           count(*)::bigint,
           count(*) filter (where verdict='positivo')::bigint,
           count(*) filter (where verdict='fraco')::bigint,
           round(avg(roas),2), round(min(roas),2), round(max(roas),2),
           round(avg(spend_cents)/100.0)
    from crm.campaign_memory
    where market_scope = p_market_scope and is_provisional = false and roas is not null
      and music_style = ANY(v_styles)
    group by funnel_stage order by 3;
    return;
  elsif p_entity_type is not null then
    return query
    select 'tipo'::text, p_entity_type::text, coalesce(funnel_stage,'(sem funil)')::text,
           count(*)::bigint,
           count(*) filter (where verdict='positivo')::bigint,
           count(*) filter (where verdict='fraco')::bigint,
           round(avg(roas),2), round(min(roas),2), round(max(roas),2),
           round(avg(spend_cents)/100.0)
    from crm.campaign_memory
    where market_scope = p_market_scope and is_provisional = false and roas is not null
      and entity_type = p_entity_type
    group by funnel_stage order by 3;
    return;
  else
    return query select 'sem_evidencia'::text, null::text, null::text,
                        0::bigint,0::bigint,0::bigint,null::numeric,null::numeric,null::numeric,null::numeric;
    return;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION crm.audience_retrieve_publics(
  p_artist text DEFAULT NULL,
  p_music_style text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_market_scope text DEFAULT 'PT',
  p_music_styles text[] DEFAULT NULL
)
RETURNS TABLE(funil text, arquetipo text, n_adsets bigint, positivos bigint, roas_medio numeric, roas_max numeric, top_publicos text[])
LANGUAGE plpgsql
STABLE
AS $function$
declare
  v_styles text[];
  v_artist_count bigint := 0;
  v_mode text;
begin
  if p_music_styles is not null and array_length(p_music_styles, 1) > 0 then
    v_styles := p_music_styles;
  elsif p_music_style is not null then
    v_styles := array[p_music_style];
  else
    v_styles := null;
  end if;

  if p_artist is not null then
    select count(*) into v_artist_count
    from crm.campaign_memory cm
    join crm.campaign_memory_element e on e.campaign_memory_id = cm.id
    where cm.market_scope = p_market_scope and cm.is_provisional = false and cm.artist = p_artist;
  end if;

  if p_artist is not null and v_artist_count >= 3 then
    v_mode := 'artist';
  elsif v_styles is not null then
    v_mode := 'style';
  elsif p_entity_type is not null then
    v_mode := 'entity';
  else
    return;
  end if;

  if v_mode = 'artist' then
    return query
    select coalesce(cm.funnel_stage,'(sem funil)')::text,
           e.audience_archetype::text,
           count(*)::bigint,
           count(*) filter (where e.verdict='positivo')::bigint,
           round(avg(e.roas),2), round(max(e.roas),2),
           (array_agg(e.audience_key order by e.roas desc nulls last))[1:3]
    from crm.campaign_memory_element e
    join crm.campaign_memory cm on cm.id = e.campaign_memory_id
    where cm.market_scope = p_market_scope and cm.is_provisional = false and e.roas is not null
      and cm.artist = p_artist
    group by cm.funnel_stage, e.audience_archetype
    order by cm.funnel_stage, round(avg(e.roas),2) desc;
  elsif v_mode = 'style' then
    return query
    select coalesce(cm.funnel_stage,'(sem funil)')::text,
           e.audience_archetype::text,
           count(*)::bigint,
           count(*) filter (where e.verdict='positivo')::bigint,
           round(avg(e.roas),2), round(max(e.roas),2),
           (array_agg(e.audience_key order by e.roas desc nulls last))[1:3]
    from crm.campaign_memory_element e
    join crm.campaign_memory cm on cm.id = e.campaign_memory_id
    where cm.market_scope = p_market_scope and cm.is_provisional = false and e.roas is not null
      and cm.music_style = ANY(v_styles)
    group by cm.funnel_stage, e.audience_archetype
    order by cm.funnel_stage, round(avg(e.roas),2) desc;
  elsif v_mode = 'entity' then
    return query
    select coalesce(cm.funnel_stage,'(sem funil)')::text,
           e.audience_archetype::text,
           count(*)::bigint,
           count(*) filter (where e.verdict='positivo')::bigint,
           round(avg(e.roas),2), round(max(e.roas),2),
           (array_agg(e.audience_key order by e.roas desc nulls last))[1:3]
    from crm.campaign_memory_element e
    join crm.campaign_memory cm on cm.id = e.campaign_memory_id
    where cm.market_scope = p_market_scope and cm.is_provisional = false and e.roas is not null
      and cm.entity_type = p_entity_type
    group by cm.funnel_stage, e.audience_archetype
    order by cm.funnel_stage, round(avg(e.roas),2) desc;
  end if;
end;
$function$;