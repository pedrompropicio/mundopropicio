---
name: artist-tiktok-sync
description: Sync oficial TikTok (Display API) — fonte primária dos vídeos do próprio artista; cursor de retoma, rate limit → partial, pausas em corridas grandes
type: feature
---

# artist-tiktok-sync (D-ERP56 + adendas)

Fonte PRIMÁRIA dos vídeos do próprio artista (Display API + Login Kit, app
"Social Music Carreira"). Escreve `artist_content` e
`artist_content_metrics_daily` (source='platform_api') e perfil em
`artist_metrics_daily`. Cron `carreira-tiktok-sync-diario` 09:55 UTC, 200
vídeos/corrida. Credenciais próprias `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`
— nunca credenciais de anúncios.

## Parâmetros
- `max_videos`: default 200, teto duro 2000.
- `since`: data ISO — a paginação para quando uma página só traz vídeos mais antigos.
- `cursor` (19/09/2026): número, cursor da Display API video/list; a paginação
  começa aí em vez do topo. Só com `artist_id` ou `connection_id` (uma ligação
  por corrida); cursor + várias ligações → 400.
- `dry_run` default true. Resposta devolve por artista `next_cursor` (null no
  fim) e `has_more`; `params` inclui `cursor`.

## Rate limit (19/09/2026)
`rate_limit_exceeded` repete a MESMA página até 2× (20 s, 40 s), teto 110 s de
invocação. Persistindo: pára, grava parcial, devolve next_cursor/has_more=true,
regista em `errors` → sync_run fecha **partial** (nunca success). A ligação
fica **active** (não 'error') por rate limit.

## Corridas grandes
`max_videos > 200` ou `cursor` presente → pausa de 400 ms entre páginas. Cron
diário (200, sem cursor) inalterado. Sync inicial de perfil grande: repetir
chamadas com `cursor=<next_cursor>` até `has_more=false`.

## Regras intocáveis
- D-ERP53: o upsert de `artist_content` nunca escreve `song_id`/`song_link_*`.
- Tokens: access 24 h / refresh 365 dias, cifrados; renovação com <6 h de vida;
  falha de renovação → ligação `expired` (é preciso religar).
- No fim corre `artist_content_link_songs` (nunca em dry_run).
