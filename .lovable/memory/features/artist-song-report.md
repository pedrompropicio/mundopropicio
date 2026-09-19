---
name: Relatório de lançamento de música (artist-song-report)
description: Geração diária por LLM a partir de snapshot da BD; guarda de 1 geração automática por música por dia de calendário UTC; erros gravados; histórico imutável.
type: feature
---
# Relatório de lançamento de música

Edge function: `supabase/functions/artist-song-report/index.ts`.

## Regras

- Só gera a partir de snapshot montado pela BD (streams, playlists, vídeos, audiência, demografia, comparáveis, benchmark alinhado). Ver D-ERP54.
- Números fora do snapshot são PROIBIDOS no prompt.
- Cada geração é uma linha nova em `artist_song_reports` (status 'ok' ou 'error'); nunca se reescreve uma anterior.
- Vista `v_song_report_latest` dá o último 'ok' por música.

## Guarda de frequência

- Trigger 'cron' (`carreira-song-report-diario`, 10:00 UTC): no máximo 1 geração automática por música por **dia de calendário UTC**.
- Pedido manual não é travado.
- A guarda conta só relatórios com `status = 'ok'`; um relatório em erro não impede nova tentativa no mesmo dia.
- Quando dá skip, loga o `id` e `generated_at` do relatório que causou o skip.

## Histórico de correções

- 2026-09-19: janela deslizante de 24h trocada por dia de calendário UTC (bug: cron chegava ~20s antes de completar 24h e pulava dias).

## Adenda 19/09/2026 — formato de números, frescura e regeneração por alteração de dados

**Números.** Contagens e ritmos por dia saem do snapshot já como INTEIROS
(`daily_gain`, `ganho_no_periodo`, médias diárias, `melhor_dia.ganho`,
`media_views_*`, `delta_views_7d`, `delta_desde_lancamento`,
`delta_30d_antes_do_lancamento`, `spotify_streams_por_dia_a_esta_idade`,
`tiktok_ugc_por_dia`). Só `delta_7d_pct`, `delta_30d_pct` e `indice` têm decimais
(1 casa). O prompt ganhou as regras 13–15 (inteiros, formato pt-BR com ponto só a
separar milhares e vírgula só em percentuais, proibido abreviar; campos numéricos da
ferramenta em número puro).

**Frescura.** `snapshot.frescura` = `gerado_em`, `ugc_tiktok_data`,
`ugc_dias_de_atraso`, `s4a_snapshot`, `s4a_dias_de_atraso`,
`benchmark_ugc_data_mais_antiga`, `benchmark_ugc_dias_de_atraso`. Regras 16–18: cada
número de registo manual é citado com a data do dado; o ritmo por dia é o do snapshot
(proibido recalcular); atraso de UGC > 2 dias ou de S4A > 8 dias vai para
`sinais_de_alerta` e trava leitura de tendência.

**Regeneração por alteração de dados.** `artist_songs.report_stale_at` +
`artist_song_reports.trigger_source` (`cron|manual|data_change`).
`artist_song_metric_set_manual` e `artist_song_playlist_streams_set` marcam só com
valor novo ou diferente, via `artist_song_mark_report_stale` (própria música se
`is_launch`; se `is_reference`, todos os lançamentos que a têm no benchmark).
`data_change` só é aceite de service_role, salta a guarda do cron, tem teto de 6
TENTATIVAS por música por dia UTC (`skipped:true, reason:'data_change_daily_cap'`) e
limpa a marca só com `report_stale_at = stale_at`. Cron `carreira-song-report-stale`
(`*/15 * * * *`, debounce de 10 minutos) é criado em Live, não por migração.

**Benchmark.** `v_song_benchmark_aligned.tiktok_ugc_por_dia` divide pela idade NA DATA
DO REGISTO (`GREATEST(tiktok_ugc_date - release_date, 1)`), nunca pela idade de hoje.
