# Proposta — charts diários do Spotify BR/PT (NÃO APLICADA)

Fonte: GET https://charts-spotify-com-service.spotify.com/auth/v0/charts/regional-{br|pt}-daily/YYYY-MM-DD
Auth: o mesmo Bearer web do S4A (getS4aAccessToken). Provado a 13/10: HTTP 200, 200 entradas por país.
Validação 11/10: BR #100 = 227.582, #200 = 156.510; PT #100 = 11.243, #200 = 8.274 (batem com o ecrã).

## Mapeamento
- position        entries[].chartEntryData.currentRank
- prev_position   entries[].chartEntryData.previousRank (≤0 ou ausente = novo → NULL)
- days_on_chart   entries[].chartEntryData.appearancesOnChart
- streams         entries[].chartEntryData.rankingMetric.value (string; type=STREAMS)
- track_name      entries[].trackMetadata.trackName
- artists         entries[].trackMetadata.artists[] {name, spotifyUri}
- spotify_track_id  trackMetadata.trackUri sem "spotify:track:"

## DDL
```sql
create table public.spotify_chart_daily (
  country text not null check (country in ('BR','PT')),
  chart_date date not null,
  position int not null check (position between 1 and 200),
  track_name text not null,
  artists jsonb not null default '[]',
  spotify_track_id text not null,
  streams bigint not null,
  prev_position int,
  days_on_chart int,
  captured_at timestamptz not null default now(),
  primary key (country, chart_date, position)
);
create index on public.spotify_chart_daily (spotify_track_id, chart_date);
alter table public.spotify_chart_daily enable row level security;
grant select on public.spotify_chart_daily to authenticated;
grant all on public.spotify_chart_daily to service_role;
create policy spotify_chart_daily_read on public.spotify_chart_daily
  for select to authenticated using (true);  -- dado público do Spotify, sem empresa

create view public.v_artist_chart_gap with (security_invoker = true) as
with lim as (
  select country, chart_date,
    max(streams) filter (where position = 100) top100_streams,
    max(streams) filter (where position = 200) top200_streams
  from public.spotify_chart_daily group by 1,2
), m as (
  select artist_id, song_id, metric_date,
    case metric when 's4a_streams_day_br' then 'BR' else 'PT' end country, value
  from public.artist_song_metrics_daily
  where platform = 'spotify' and metric in ('s4a_streams_day_br','s4a_streams_day_pt')
), pos as (
  select i.song_id, c.country, c.chart_date, min(c.position) best
  from public.artist_song_identifiers i
  join public.spotify_chart_daily c on c.spotify_track_id = i.external_id
  where i.platform = 'spotify' group by 1,2,3
)
select m.artist_id, m.song_id, m.country, m.metric_date chart_date,
  l.top100_streams, l.top200_streams, p.best artist_best_position,
  m.value artist_streams_s4a,
  greatest(l.top200_streams - m.value, 0) gap_top200,
  greatest(l.top100_streams - m.value, 0) gap_top100
from m join lim l on l.country = m.country and l.chart_date = m.metric_date
left join pos p on p.song_id = m.song_id and p.country = m.country and p.chart_date = m.metric_date;
```
A RLS de área (songs) chega pela tabela base artist_song_metrics_daily.

## Recolha
- Edge function `spotify-charts-sync` (verify_jwt=true, service_role): usa o token S4A de um artista com ligação activa; para BR e PT pede a data D-1 (e as 3 anteriores em falta), upsert por PK; regista em sync_runs; 404/sem entradas = no_data.
- Backfill: corpo `{from:"2026-09-26", to:"<ontem>"}`, 1 pedido/s.
- Cron novo às 21:00 UTC (depois da 2.ª corrida S4A, 20:30/20:45) via cron.schedule.
