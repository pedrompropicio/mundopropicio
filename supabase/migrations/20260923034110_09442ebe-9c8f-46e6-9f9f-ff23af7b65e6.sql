create or replace function public.artist_dashboard_platform_label(p_platform text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case p_platform
    when 'instagram' then 'Instagram'
    when 'tiktok' then 'TikTok'
    when 'youtube' then 'YouTube'
    when 'facebook' then 'Facebook'
    when 'spotify' then 'Spotify'
    when 'sua_musica' then 'Sua Música'
    when 'deezer' then 'Deezer'
    when 'apple_music' then 'Apple Music'
    else coalesce(p_platform, '?')
  end
$$;
revoke execute on function public.artist_dashboard_platform_label(text) from public;
revoke execute on function public.artist_dashboard_platform_label(text) from anon;
grant execute on function public.artist_dashboard_platform_label(text) to authenticated, service_role;

create or replace function public.artist_dashboard(
  p_artist_id uuid,
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, crm, pg_catalog
as $function$
declare
  v_uid uuid := auth.uid();
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
  select a.company_id, a.name into v_company, v_nome
  from public.artists a where a.id = p_artist_id;
  if v_company is null then
    raise exception 'artista inexistente ou sem empresa' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'sessão obrigatória' using errcode = '42501';
  end if;
  if not public.has_role(v_uid, 'platform_admin'::app_role) then
    if not exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_uid and ur.company_id = v_company
    ) then
      raise exception 'sem acesso a este artista' using errcode = '42501';
    end if;
  end if;

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
  out as (
    select c.grupo, c.platform, c.metric, c.source, c.metric_date as as_of,
      case when c.metric_date >= p_from then c.value end as atual,
      p.value as anterior,
      coalesce(sr.s, '[]'::jsonb) as serie
    from cur c
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
      'as_of', as_of, 'source', source, 'serie', serie
    ) order by platform, metric) filter (where grupo = 'redes'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'platform', platform, 'metric', metric,
      'atual', atual, 'anterior', anterior,
      'delta', case when atual is not null and anterior is not null then atual - anterior end,
      'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                       then round(((atual - anterior) / anterior) * 100, 2) end,
      'as_of', as_of, 'source', source, 'serie', serie
    ) order by platform, metric) filter (where grupo = 'canais'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(
        public.artist_dashboard_platform_label(platform) || ' sem dado desde ' ||
        to_char(as_of, 'DD/MM')
      ) order by platform, metric) filter (where atual is null), '[]'::jsonb)
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
    ),
    src as (
      select metric,
        case when bool_or(source = 'platform_api') then 'platform_api'
             else (array_agg(source order by metric_date desc))[1] end as source
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
        substring(c.source_ref from 'precis[ãa]o:\s*([^;]+)') as precisao
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

revoke execute on function public.artist_dashboard(uuid, date, date) from public;
revoke execute on function public.artist_dashboard(uuid, date, date) from anon;
grant execute on function public.artist_dashboard(uuid, date, date) to authenticated, service_role;