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
