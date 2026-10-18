# D-ERP234 — diagnóstico de toque iOS

18/10/2026 03:38–03:40 UTC. Autorização direta do Pedro nesta sessão; sem Publish.

- Migração oficial `drizzle/migrations/0194_derp234_ios_touch_diagnostic_kinds.sql` aplicada. Leitura Live confirma os oito kinds anteriores mais feedback_shown e tap_repeat_blocked; restantes constraints inalteradas.
- Deploy restrito `portal-track`, source SHA256 final `5831376e3c16c8b80488f35996ecacdb82cf3e415ee59ee68541824cf0c9ac3a`.
- Envelope `kind:diag`, consent:false, payload com kind/slug/ms/in_app/detail/arrival_event_id; alias song_link_diag aceite. Origem autorizada https://mundopropicio.com. Sem IP/geo, consent ledger ou eventos externos no ramo de diagnóstico.
- Primeira prova usou in_app:ios, inválido pela constraint existente; POST500, insert400, leitura0. Não se alterou a constraint: validação alinhada aos valores existentes e repetição com instagram. ms mantém intervalo0–86400000.
- Teste fonte de consentimento distinguia incorretamente o literal tiktok de uma chamada externa: ajustada guarda para URLs externas, mantendo recusa de destinos externos.

## Prova HTTP e leitura

Ambos POST em 03:39:59 UTC: HTTP200, resposta `{"ok":true}`. Leitura antes da limpeza:

```text
id=206460 kind=feedback_shown slug=teste_chat2 ms=123 in_app=instagram
detail=ios_touch_20261018_033846_feedback
arrival_event_id=95b8aa49-b6b7-4b2e-aee1-21b902b68ec4

id=206461 kind=tap_repeat_blocked slug=teste_chat2 ms=456 in_app=instagram
detail=ios_touch_20261018_033846_repeat
arrival_event_id=95b8aa49-b6b7-4b2e-aee1-21b902b68ec4
```

Limpeza autorizada por DML: predicate combinado ID+slug+arrival_event_id+kind+detail; RETURNING confirmou apenas206460/206461. SELECT posterior: test_rows_remaining=0. Nenhum DELETE amplo por slug.

## Testes

`bunx vitest run src/test/portal-track-diag.test.ts src/test/consent-contract-322.test.ts src/test/song-link-ssr.test.ts`

```text
Test Files 3 passed (3)
Tests 80 passed (80)
```

18 testes diagnósticos +38 consentimento +24 SSR. `git diff --check` sem erros; build automático03:39:51 UTC OK. CI remoto não consultado. Esta prova verifica transporte/persistência; não simula um toque num iPhone nem altera o Portal.