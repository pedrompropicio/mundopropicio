---
name: MP Audience Full Sync inclui criativos
description: handleSync no MP Audience invoca crm-meta-sync-creatives após ads com max=2000; conexões novas já não dependem só do cron diário (100/dia)
type: feature
---

`src/pages/crm/Campaigns.tsx` → `handleSync` agora corre 5 passos: campaigns → adsets → ads → insights → **creatives**.

Step 5 invoca `crm-meta-sync-creatives` com `{ mode: "incremental", max_creatives_per_run: 2000, triggered_by: "full-sync-ui" }`. Cap 2000 é o máximo aceite pela função (`index.ts:434`).

**Razão:** o cron diário corre só com cap 100, pelo que conexões novas (ex.: Siriguella, 2026-06: 272 criativos em backlog) ficavam dias à espera de catálogo completo, e os ads apareciam na UI como "criativo não sincronizado". Full Sync da UI passa a drenar o backlog numa única run.

Toast final mostra `synced_count` e `remaining_to_sync` quando > 0. Função, paginação e cron permanecem inalterados.
