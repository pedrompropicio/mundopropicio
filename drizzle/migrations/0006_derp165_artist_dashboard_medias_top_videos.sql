CREATE OR REPLACE FUNCTION public.artist_dashboard(p_artist_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_catalog'
AS $function$
declare
  v_company uuid;
  v_nome text;
  v_song_id uuid;
  v_song_title text;
  v_song_release date;
  v_redes jsonb := '[]'::jsonb;
  v_canais jsonb := '[]'::jsonb;
  v_musica jsonb := '{}'::jsonb;
  v_camp jsonb := '{}'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_days integer := greatest(1, (current_date - p_from) + 1);
begin
  -- pertença: mesmo padrão das RPCs artist_ads_* (service_role passa; sessão sem papel recusa)
  v_company := public.artist_ads_assert_access(p_artist_id);

  select a.name into v_nome from public.artists a where a.id = p_artist_id;

  -- música de trabalho: artist_songs não tem is_working_single; a flag real é is_launch
  select s.id, s.title, s.release_date
    into v_song_id, v_song_title, v_song_release
  from public.artist_songs s
  where s.artist_id = p_artist_id
  order by (s.is_launch is true) desc,
           coalesce(s.launch_started_at, s.release_date) desc nulls last,
           s.release_date desc nulls last
  limit 1;

  with want(grupo, platform, metric) as (
    values
      ('redes','instagram','followers'),
      ('redes','instagram','reach'),
      ('redes','instagram','total_interactions'),
      ('redes','instagram','views'),
      ('redes','tiktok','followers'),
      ('redes','tiktok','likes'),
      ('redes','tiktok','video_count'),
      ('redes','youtube','subscribers'),
      ('redes','facebook','followers'),
      ('canais','spotify','monthly_listeners'),
      ('canais','sua_musica','plays_total'),
      ('canais','sua_musica','downloads_total'),
      ('canais','sua_musica','uploads'),
      ('canais','deezer','fans'),
      ('canais','apple_music','followers')
  ),
  base as (
    select w.grupo, m.platform, m.metric, m.source, m.metric_date, m.value
    from want w
    join public.artist_metrics_daily m
      on m.platform = w.platform and m.metric = w.metric
     and m.artist_id = p_artist_id
    where m.metric_date <= p_to and m.value is not null
    union all
    select 'canais', 'spotify', 'catalog_streams', 'aggregator', sm.metric_date, sum(sm.value)
    from public.artist_song_metrics_daily sm
    where sm.artist_id = p_artist_id and sm.platform = 'spotify'
      and sm.metric = 'streams' and sm.metric_date <= p_to and sm.value is not null
    group by sm.metric_date
    union all
    select 'canais', 'youtube', 'catalog_views', 'aggregator', sm.metric_date, sum(sm.value)
    from public.artist_song_metrics_daily sm
    where sm.artist_id = p_artist_id and sm.platform = 'youtube'
      and sm.metric in ('views','video_views') and sm.metric_date <= p_to and sm.value is not null
    group by sm.metric_date
  ),
  src as (
    select grupo, platform, metric,
      case when bool_or(source = 'platform_api') then 'platform_api'
           else (array_agg(source order by metric_date desc))[1] end as source
    from base group by 1,2,3
  ),
  f as (
    select b.* from base b join src s
      on s.grupo = b.grupo and s.platform = b.platform and s.metric = b.metric
     and s.source = b.source
  ),
  cur as (
    select distinct on (grupo, platform, metric)
      grupo, platform, metric, source, value, metric_date
    from f order by grupo, platform, metric, metric_date desc
  ),
  prev as (
    select distinct on (grupo, platform, metric)
      grupo, platform, metric, value
    from f where metric_date <= p_from
    order by grupo, platform, metric, metric_date desc
  ),
  serie as (
    select grupo, platform, metric,
      jsonb_agg(jsonb_build_object('d', metric_date, 'v', value) order by metric_date) s
    from f where metric_date between p_from and p_to
    group by 1,2,3
  ),
  -- D-ERP165: métricas que são o total de UM dia comparam médias de 7 dias fechados.
  tipo as (
    select c.grupo, c.platform, c.metric,
      case when (c.platform = 'instagram' and c.metric in
                  ('reach','views','total_interactions','accounts_engaged',
                   'profile_links_taps','followers_gained','followers_lost'))
             or c.metric like '%\_day'
           then 'dia_fechado' else 'instantaneo' end as tipo
    from cur c
  ),
  fim as (
    select t.grupo, t.platform, t.metric,
      (select max(x.metric_date) from f x
        where x.grupo = t.grupo and x.platform = t.platform and x.metric = t.metric
          and x.metric_date <= least(p_to, current_date - 1)) as ate
    from tipo t where t.tipo = 'dia_fechado'
  ),
  medias as (
    select e.grupo, e.platform, e.metric, e.ate,
      avg(x.value) filter (where x.metric_date between e.ate - 6 and e.ate) as m_atual,
      count(x.value) filter (where x.metric_date between e.ate - 6 and e.ate) as n_atual,
      avg(x.value) filter (where x.metric_date between e.ate - 13 and e.ate - 7) as m_ant,
      count(x.value) filter (where x.metric_date between e.ate - 13 and e.ate - 7) as n_ant
    from fim e
    left join f x on x.grupo = e.grupo and x.platform = e.platform and x.metric = e.metric
     and x.metric_date between e.ate - 13 and e.ate
    group by 1,2,3,4
  ),
  out as (
    select c.grupo, c.platform, c.metric, c.source, c.metric_date as as_of, t.tipo,
      case when t.tipo = 'dia_fechado' then round(md.m_atual, 2)
           when c.metric_date >= p_from then c.value end as atual,
      case when t.tipo = 'dia_fechado' then round(md.m_ant, 2) else p.value end as anterior,
      (c.metric_date < p_from) as parado,
      case when t.tipo = 'dia_fechado' then jsonb_build_object(
        'janela_atual', jsonb_build_object('de', md.ate - 6, 'ate', md.ate, 'dias_com_dados', coalesce(md.n_atual,0)),
        'janela_anterior', jsonb_build_object('de', md.ate - 13, 'ate', md.ate - 7, 'dias_com_dados', coalesce(md.n_ant,0)),
        'ultimo_dia', jsonb_build_object('valor', c.value, 'data', c.metric_date))
      else '{}'::jsonb end as extra,
      coalesce(sr.s, '[]'::jsonb) as serie
    from cur c
    join tipo t on t.grupo = c.grupo and t.platform = c.platform and t.metric = c.metric
    left join medias md on md.grupo = c.grupo and md.platform = c.platform and md.metric = c.metric
    left join prev p on p.grupo = c.grupo and p.platform = c.platform and p.metric = c.metric
    left join serie sr on sr.grupo = c.grupo and sr.platform = c.platform and sr.metric = c.metric
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'platform', platform, 'metric', metric,
      'atual', atual, 'anterior', anterior,
      'delta', case when atual is not null and anterior is not null then atual - anterior end,
      'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                       then round(((atual - anterior) / anterior) * 100, 2) end,
      'as_of', as_of, 'source', source, 'serie', serie, 'tipo', tipo
    ) || extra order by platform, metric) filter (where grupo = 'redes'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'platform', platform, 'metric', metric,
      'atual', atual, 'anterior', anterior,
      'delta', case when atual is not null and anterior is not null then atual - anterior end,
      'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                       then round(((atual - anterior) / anterior) * 100, 2) end,
      'as_of', as_of, 'source', source, 'serie', serie, 'tipo', tipo
    ) || extra order by platform, metric) filter (where grupo = 'canais'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(
        public.artist_dashboard_platform_label(platform) || ' sem dado desde ' ||
        to_char(as_of, 'DD/MM')
      ) order by platform, metric) filter (where atual is null or parado), '[]'::jsonb)
  into v_redes, v_canais, v_avisos
  from out;

  if v_song_id is not null then
    with want(metric) as (values ('streams'), ('ugc_videos'), ('ugc_videos_sounds')),
    base as (
      select sm.metric, sm.source, sm.source_ref, sm.metric_date, sm.value
      from public.artist_song_metrics_daily sm
      join want w on w.metric = sm.metric
      where sm.song_id = v_song_id and sm.metric_date <= p_to and sm.value is not null
        and (sm.metric <> 'streams' or sm.platform = 'spotify')
        -- ugc_videos: só atalho iOS ou manual; tiktok_artists vive em musica.ttfa
        and (sm.metric <> 'ugc_videos' or sm.source in ('ios_shortcut','manual'))
    ),
    src as (
      select metric,
        case
          when metric = 'ugc_videos' then
            case when bool_or(source = 'ios_shortcut') then 'ios_shortcut' else 'manual' end
          when bool_or(source = 'platform_api') then 'platform_api'
          else (array_agg(source order by metric_date desc))[1]
        end as source
      from base group by 1
    ),
    f as (select b.* from base b join src s on s.metric = b.metric and s.source = b.source),
    cur as (
      select distinct on (metric) metric, source, source_ref, value, metric_date
      from f order by metric, metric_date desc
    ),
    prev as (
      select distinct on (metric) metric, value from f
      where metric_date <= p_from order by metric, metric_date desc
    ),
    serie as (
      select metric, jsonb_agg(jsonb_build_object('d', metric_date, 'v', value) order by metric_date) s
      from f where metric_date between p_from and p_to group by 1
    ),
    out as (
      select c.metric, c.source, c.metric_date as as_of,
        case when c.metric_date >= p_from then c.value end as atual,
        p.value as anterior,
        coalesce(sr.s, '[]'::jsonb) as serie,
        case when c.metric = 'ugc_videos' then c.source
             else substring(c.source_ref from 'precis[ãa]o:\s*([^;]+)') end as precisao
      from cur c
      left join prev p on p.metric = c.metric
      left join serie sr on sr.metric = c.metric
    ),
    j as (
      select metric, jsonb_build_object(
        'atual', atual, 'anterior', anterior,
        'delta', case when atual is not null and anterior is not null then atual - anterior end,
        'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                         then round(((atual - anterior) / anterior) * 100, 2) end,
        'as_of', as_of, 'source', source, 'precisao', precisao, 'serie', serie
      ) as obj,
      case when atual is null then
        (case metric when 'streams' then 'Spotify (música de trabalho)'
                     when 'ugc_videos' then 'UGC TikTok'
                     else 'UGC sons TikTok' end)
        || ' sem dado desde ' || to_char(as_of, 'DD/MM') end as aviso
      from out
    )
    select
      jsonb_build_object(
        'streams',           coalesce((select obj from j where metric = 'streams'), 'null'::jsonb),
        'ugc_videos',        coalesce((select obj from j where metric = 'ugc_videos'), 'null'::jsonb),
        'ugc_videos_sounds', coalesce((select obj from j where metric = 'ugc_videos_sounds'), 'null'::jsonb)
      ),
      v_avisos || coalesce((select jsonb_agg(to_jsonb(aviso)) from j where aviso is not null), '[]'::jsonb)
    into v_musica, v_avisos;

    v_musica := v_musica || jsonb_build_object('ttfa', (
      select jsonb_build_object(
        'criadores', max(value) filter (where metric = 'ugc_creators'),
        'views',     max(value) filter (where metric = 'ugc_views'),
        'as_of',     max(metric_date)
      )
      from public.artist_song_metrics_daily
      where song_id = v_song_id and source = 'tiktok_artists'
        and metric in ('ugc_creators','ugc_views') and metric_date <= p_to
        and metric_date = (
          select max(metric_date) from public.artist_song_metrics_daily x
          where x.song_id = v_song_id and x.source = 'tiktok_artists' and x.metric_date <= p_to
        )
    ));

    v_musica := v_musica || jsonb_build_object('benchmark', (
      with b as (
        select song_id, is_self, spotify_streams_dia_n, spotify_streams_dia_n_date,
               rank() over (order by spotify_streams_dia_n desc nulls last) as pos,
               count(*) over () as total
        from public.v_song_benchmark_aligned
        where launch_song_id = v_song_id
      )
      select jsonb_build_object('posicao', pos, 'total', total, 'as_of', spotify_streams_dia_n_date)
      from b where is_self limit 1
    ));

    v_musica := v_musica || jsonb_build_object('relatorio_em', (
      select max(generated_at) from public.artist_song_reports
      where song_id = v_song_id and status = 'ok'
    ));
  else
    v_musica := jsonb_build_object('streams', null, 'ugc_videos', null,
      'ugc_videos_sounds', null, 'ttfa', null, 'benchmark', null, 'relatorio_em', null);
    v_avisos := v_avisos || to_jsonb('Artista sem música de trabalho definida'::text);
  end if;

  with d as (
    select * from public.artist_ads_daily(p_artist_id, v_days) x
    where x.day between p_from and p_to
  ),
  por as (
    select platform,
      sum(spend) as gasto, sum(impressions) as impressoes,
      sum(results) as resultados, sum(video_views) as video_views,
      (array_agg(currency order by day desc))[1] as moeda
    from d group by platform
  ),
  serie as (
    select platform, jsonb_agg(jsonb_build_object(
        'd', day, 'gasto', gasto, 'impressoes', impressoes, 'resultados', resultados
      ) order by day) s
    from (
      select platform, day, sum(spend) gasto, sum(impressions) impressoes, sum(results) resultados
      from d group by platform, day
    ) t group by platform
  )
  select jsonb_build_object(
    'por_plataforma', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', p.platform, 'gasto', p.gasto, 'impressoes', p.impressoes,
        'resultados', p.resultados,
        'tipo_resultado', case when coalesce(p.resultados,0) > 0 then 'resultados'
                               when coalesce(p.video_views,0) > 0 then 'visualizacoes' end,
        'cpm', case when coalesce(p.impressoes,0) > 0 then round(p.gasto / p.impressoes * 1000, 4) end,
        'cpv', case when coalesce(p.video_views,0) > 0 then round(p.gasto / p.video_views, 4) end,
        'alcance', null, 'moeda', p.moeda,
        'serie', coalesce(sr.s, '[]'::jsonb)
      ) order by p.platform)
      from por p left join serie sr on sr.platform = p.platform), '[]'::jsonb),
    'ativas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', c.platform, 'campaign_id', c.campaign_id, 'nome', c.campaign_name,
        'estado', c.status, 'orcamento_dia', c.budget_daily,
        'gasto_periodo', (select sum(x.spend) from d x
                           where x.platform = c.platform and x.campaign_id = c.campaign_id)
      ) order by c.platform, c.campaign_name)
      from public.artist_ads_campaigns(p_artist_id, false) c
      where c.status = 'ACTIVE'), '[]'::jsonb),
    'tetos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'teto_dia', t.daily_cap, 'comprometido', t.committed_daily
      ) order by t.platform)
      from public.artist_ads_budget_cap_get(p_artist_id) t
      where t.has_cap), '[]'::jsonb)
  ) into v_camp;

  return jsonb_build_object(
    'periodo', jsonb_build_object('from', p_from, 'to', p_to),
    'artista', jsonb_build_object('id', p_artist_id, 'nome', v_nome,
      'musica_trabalho', case when v_song_id is null then null else jsonb_build_object(
        'song_id', v_song_id, 'titulo', v_song_title, 'lancamento', v_song_release,
        'dias', case when v_song_release is null then null else (p_to - v_song_release) end
      ) end),
    'redes', v_redes,
    'canais', v_canais,
    'musica', v_musica,
    'campanhas', v_camp,
    'avisos', v_avisos
  );
end
$function$;

REVOKE ALL ON FUNCTION public.artist_dashboard(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_dashboard(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_top_videos_gain(p_artist_id uuid, p_dias integer, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- D-ERP165: "Mais vistos nos últimos N dias". Ganho = views no último dia com
-- dados − views no dia imediatamente antes do início da janela. Sem ponto de
-- partida → fora do top, mas contado em sem_ponto_partida.
declare
  v_dias int := greatest(1, coalesce(p_dias, 1));
  v_lim int := least(100, greatest(1, coalesce(p_limit, 10)));
  v_out jsonb;
begin
  perform public.artist_ads_assert_access(p_artist_id);

  with ult as (
    select platform, max(metric_date) as ate
    from public.artist_content_metrics_daily
    where artist_id = p_artist_id and metric = 'views' and metric_date <= current_date
    group by platform
  ),
  pts as (
    select m.content_id, m.platform, m.metric, m.metric_date, max(m.value) as value
    from public.artist_content_metrics_daily m
    join ult u on u.platform = m.platform
    where m.artist_id = p_artist_id and m.metric in ('views','likes')
      and m.metric_date between u.ate - v_dias and u.ate
    group by 1,2,3,4
  ),
  por as (
    select p.content_id, p.platform,
      (array_agg(p.value order by p.metric_date desc) filter (where p.metric = 'views' and p.metric_date > u.ate - v_dias))[1] as v_fim,
      max(p.value) filter (where p.metric = 'views' and p.metric_date = u.ate - v_dias) as v_ini,
      (array_agg(p.value order by p.metric_date desc) filter (where p.metric = 'likes' and p.metric_date > u.ate - v_dias))[1] as l_fim,
      max(p.value) filter (where p.metric = 'likes' and p.metric_date = u.ate - v_dias) as l_ini
    from pts p join ult u on u.platform = p.platform
    group by 1,2
  ),
  top as (
    select o.*, (o.v_fim - o.v_ini) as ganho
    from por o where o.v_fim is not null and o.v_ini is not null
    order by (o.v_fim - o.v_ini) desc, o.v_fim desc
    limit v_lim
  )
  select jsonb_build_object(
    'janela', jsonb_build_object(
      'de', (select max(ate) from ult) - v_dias + 1, 'ate', (select max(ate) from ult), 'dias', v_dias),
    'ultimo_dia_com_dados', coalesce((select jsonb_object_agg(platform, ate) from ult), '{}'::jsonb),
    'sem_ponto_partida', (select count(*) from por where v_fim is not null and v_ini is null),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'content_id', t.content_id, 'platform', t.platform,
        'title', coalesce(c.title, c.caption_excerpt),
        'thumbnail', c.thumbnail_url, 'url', c.permalink, 'published_at', c.published_at,
        'views_ganhas', t.ganho, 'views_total', t.v_fim,
        'gostos_ganhos', case when t.l_fim is not null and t.l_ini is not null then t.l_fim - t.l_ini end,
        'gostos_total', t.l_fim
      ) order by t.ganho desc, t.v_fim desc)
      from top t join public.artist_content c on c.id = t.content_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$function$;

REVOKE ALL ON FUNCTION public.artist_top_videos_gain(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_top_videos_gain(uuid, integer, integer) TO authenticated, service_role;