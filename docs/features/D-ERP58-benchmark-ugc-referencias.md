# D-ERP58 — Benchmark UGC dos comparáveis (Soundcharts)

## O que existe
- Coluna `artist_songs.is_reference` (default false): músicas recolhidas
  automaticamente de artistas com `roster_type = 'referencia'`.
  Ficam `tracking_status='ativo'` (para o `song-soundcharts-sync` as sincronizar)
  e `is_launch=false` — o cron do relatório LLM (`carreira-song-report-diario`)
  só percorre `is_launch=true`, logo não entram em relatórios nem nos
  Lançamentos do elenco.
- Edge function `soundcharts-reference-songs`
  (`POST {company_id?, artist_id?, days=120, max_songs=3, dry_run=true}`):
  `GET /api/v2.21/artist/{uuid}/songs?sortBy=releaseDate&sortOrder=desc&limit=100`
  (UUID em `artist_channels` platform `aggregator`), escolhe até `max_songs`
  lançamentos dos últimos `days` dias, **insere** (nunca faz upsert nem
  reatribui) e chama o `song-soundcharts-sync` por música com
  `start_date = release_date`, todas as plataformas.
- Vista `public.v_song_ugc_benchmark` (security_invoker): por música do elenco e
  de referência — `artist_name`, `title`, `release_date`,
  `dias_desde_lancamento`, `tiktok_videos_latest` (+ `_source`, `_por_dia`),
  `instagram_reels_latest`, `spotify_streams_latest`, `spotify_streams_por_dia`.
  Fallback: se não houver `tiktok/videos` do agregador usa a métrica manual
  `tiktok/ugc_videos` (source `manual`), sinalizada em `tiktok_videos_source`.
- Cron `carreira-reference-songs-semanal`, domingos 09:35 UTC, `dry_run=false`,
  uma chamada por artista de referência.

## Cuidado importante (bug corrigido no mesmo dia)
A mesma obra pode já existir como lançamento do elenco (feats). O UUID é único
por empresa: a primeira versão fazia `upsert` e reatribuiu duas músicas do Litto
Lins ao Léo Foguete (perdendo `is_launch`). Reposto por SQL e a função passou a
**ignorar** UUIDs já existentes (nota "já existe no sistema — mantida como
está"). Nunca voltar ao upsert.

## Primeira execução real (2026-09-13, Social Artists)
12 músicas de referência inseridas; 5 chamadas Soundcharts na listagem +
144 nas métricas = **149 chamadas**. Nenhuma música de referência tem TikTok
ligado no Soundcharts (HTTP 404 em `audience/tiktok`); Instagram só o
"Tu Pode Falar Mal" (30.000 reels). Spotify disponível em todas.
