# Carreira — S4A e UGC, 25/10/2026

## Resultado parcial e limites
Captura 1day implantada; comparação SQL aplicada. Nenhuma captura real/manual, backfill ou Publish. Categorias de origem sem endpoint comprovado; flag desligada. Frontend Gestão Artística não alterado (snapshot só leitura).

## Formas novas (dry_run autenticado HTTP 200)
```json
{
  "1day": {
    "status_http": 200,
    "forma": {
      "data": [
        {
          "uri": "string",
          "author": "string",
          "streams": "string",
          "title": "string",
          "dateAdded": "string",
          "thumbnailUrl": "string",
          "isAlgorithmic": "boolean",
          "isAlgotorial": "boolean"
        }
      ],
      "playlistOverall": "string"
    }
  },
  "7day": {
    "status_http": 200,
    "forma": {
      "data": [
        {
          "uri": "string",
          "author": "string",
          "streams": "string",
          "title": "string",
          "dateAdded": "string",
          "thumbnailUrl": "string",
          "isAlgorithmic": "boolean",
          "isAlgotorial": "boolean"
        }
      ],
      "playlistOverall": "string"
    }
  }
}
```

Origem: endpoint não observado; nenhuma forma inventada. Stats observado contém streams/listeners/streams_per_listener/playlist_adds/saves, não categorias de origem.

## Valores 10/10–D
D=23/10/2026. Valores 1day de 23/10 são do dry_run, não persistidos. Dias anteriores sem base/seed histórica demonstrável ficam null; sem interpolação. Spotify global da música, independente do país de tráfego. Top-100 não é cobertura de todas as playlists.
```json
[
  {
    "day": "2026-10-10",
    "spotify_total": 100595,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": null,
    "ugc_new": null,
    "sounds": null
  },
  {
    "day": "2026-10-11",
    "spotify_total": 86869,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5324,
    "ugc_new": null,
    "sounds": 29
  },
  {
    "day": "2026-10-12",
    "spotify_total": 80902,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5491,
    "ugc_new": 167,
    "sounds": 29
  },
  {
    "day": "2026-10-13",
    "spotify_total": 74713,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5618,
    "ugc_new": 127,
    "sounds": 29
  },
  {
    "day": "2026-10-14",
    "spotify_total": 72825,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5680,
    "ugc_new": 62,
    "sounds": 29
  },
  {
    "day": "2026-10-15",
    "spotify_total": 80399,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5771,
    "ugc_new": 91,
    "sounds": 28
  },
  {
    "day": "2026-10-16",
    "spotify_total": 95990,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5973,
    "ugc_new": 202,
    "sounds": 29
  },
  {
    "day": "2026-10-17",
    "spotify_total": 107448,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 6169,
    "ugc_new": 196,
    "sounds": 29
  },
  {
    "day": "2026-10-18",
    "spotify_total": 92495,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 6350,
    "ugc_new": 181,
    "sounds": 29
  },
  {
    "day": "2026-10-19",
    "spotify_total": 81481,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5746,
    "ugc_new": -604,
    "sounds": 29
  },
  {
    "day": "2026-10-20",
    "spotify_total": 79810,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5793,
    "ugc_new": 47,
    "sounds": 29
  },
  {
    "day": "2026-10-21",
    "spotify_total": 108056,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 5861,
    "ugc_new": 68,
    "sounds": 29
  },
  {
    "day": "2026-10-22",
    "spotify_total": 106658,
    "radio": null,
    "radio_pct": null,
    "other_spotify": null,
    "listener_playlists": null,
    "rest": null,
    "source": "historical_daily_unavailable",
    "ugc_total": 6005,
    "ugc_new": 144,
    "sounds": 29
  },
  {
    "day": "2026-10-23",
    "spotify_total": 117319,
    "radio": 36634,
    "radio_pct": 31.226,
    "other_spotify": 3019,
    "listener_playlists": 52850,
    "rest": 24816,
    "source": "dry_run_1day_not_stored",
    "ugc_total": 6066,
    "ugc_new": 61,
    "sounds": 29
  }
]
```

## UGC 18→19/10
6.350→5.746 (−604), 29/29 sons, mesma identidade de sons e mesma fonte Apify; source_ref descreve precisão completa nos dois dias. Ator dzN8Pp8yxmp9Jzzyd mantido. Maior queda no som principal: 5.377→4.851 (−526). Não prova vídeos removidos nem alteração de versão do ator; causa externa permanece indeterminada.

## Validações
Baseline Vitest: 2.464 PASS / 6 skip / 11 todo. Final: 2.485 PASS / mesmos skip/todo. Focados: 21 PASS. Deno check limpo. Build automático OK. tsgo manual não executado por regra do ambiente; CI remoto não consultável/verificado.

RPCs autenticados: HTTP 200; artist_ads_compare mantém keys anteriores + musica_daily/trafego_diario (37 linhas tráfego, 28 música). Guardas EXECUTE: anon=false, authenticated/service_role=true. Testes PostgreSQL locais usam SQL integral aplicado e dados fictícios, validam custos 60/30=2 Meta e 20/10=2 TikTok, moeda separada, falta=null e UGC signed.

## Deploy
Somente s4a-daily-sync; ferramenta confirmou sucesso. Source SHA-256 submetido: a7a2951cece8227a6627bf134601f3a44fd81dde0f87da0b4a8689a532edd7b0. Dry_run após deploy: HTTP 200, 200 playlists propostas (100×28day +100×1day), source_origins.enabled=false, endpoint_unverified. OPTIONS 200; token inválido 401. Hash submetido não prova por si os bytes servidos; dry_run confirma comportamento novo.

## Ficheiros
- supabase/functions/s4a-daily-sync/index.ts
- supabase/functions/_shared/s4a-play-origins.ts
- src/test/s4a-play-origins.test.ts
- src/test/s4a-daily-compare-sql.test.ts
- drizzle/migrations/0241_s4a_daily_compare.sql
- drizzle/migrations/meta/_journal.json (gerado pela ferramenta)
- src/integrations/supabase/types.ts (regenerado pela ferramenta)
- AGENTS.md
- roadmap.md
- .lovable/memory/features/career-s4a-play-origins.md
- docs/testes/carreira-s4a-origens-20261025.md
- docs/questoes-carreira-s4a-origens-20261025.md
Memória persistente equivalente atualizada; plano aprovado arquivado pela ferramenta.
