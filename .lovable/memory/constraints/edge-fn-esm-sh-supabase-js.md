---
name: Edge functions — nunca importar supabase-js via esm.sh
description: esm.sh/@supabase/supabase-js quebrou o boot (WORKER_ERROR, node:url not found) e parou o CAPI 16 dias; usar sempre npm:@supabase/supabase-js@2
type: constraint
---

**Proibido** `import { createClient } from "https://esm.sh/@supabase/supabase-js@<v>"` em edge functions.
Usar sempre `npm:@supabase/supabase-js@2`.

**Why:** em 2026-08-07 o build esm.sh de `supabase-js@2.50.0` passou a arrastar `ws` →
`module "node:url" not found` → crash **no boot** (`WORKER_ERROR`, HTTP 500 no gateway).
Consequência: `process-leads-capi` (cron `*/5`) falhou em silêncio 16 dias, 721 leads
VIP da Ivete nunca chegaram ao Meta; ~151 caducaram na regra dos 7 dias (`skipped_old`).

**Outras regras aprendidas no mesmo incidente:**
- Não chamar edge→edge por item (era `process-leads-capi` → `capi-meta-events`): o gateway
  devolve `RateLimitError` em lote. POST directo ao Graph (`v25.0`), token do vault
  `META_CAPI_ACCESS_TOKEN`, como fazem os `portal_tick_*`.
- Estados intermédios precisam de retoma: `capi_status='processing'` sem timeout deixou 1 lead
  preso desde 14/07. Hoje a edge repõe `processing` > 30 min para `retry`.
- A RPC pode consumir um batch inteiro só com `skipped_old`/`skipped_no_pixel` e devolver 0
  linhas — 0 linhas **não** significa fila drenada; confirmar por contagem.
- Alarme: cron horário `leads-capi-health` → `public.check_leads_capi_health()` cria
  `system_reminders` com key `leads_capi_stalled` (banner /admin + WhatsApp diário).
