---
name: Funnel Test 360 — presets
description: Registry de presets por hostname em crm-meta-funnel-test-run; preset portal (mundopropicio.com) valida landing sem checkout
type: feature
---

- Registry: `supabase/functions/crm-meta-funnel-test-run/presets/index.ts`, dispatch por hostname (`selectPreset`). Hostname sem preset → HTTP 400 `unsupported_provider` (run gravado com severity `info`).
- Presets: `ticketline.ts` (fluxo completo até checkout) e `portal.ts` (Issue #12, 2026-09-20) para `mundopropicio.com` / `www.mundopropicio.com`.
- `PORTAL_PRESET` (id `portal-mundopropicio`, v1.0.0): 4 steps — abrir landing (lhKey `home`) → aceitar cookies (consentimento é pré-requisito do Pixel) → validar PageView (`validateOnly`) → validar ViewContent (`validateOnly`, lhKey `product`). **Sem cadeia de checkout: o portal não vende.**
- `PROVIDERS_KNOWN` inclui `"portal"`. Se um dia entrar em `public.events.ticketing_provider`, o CHECK constraint precisa de migração própria.
- Pré-requisitos dos steps são derivados da ordem do array (`step[i].prereq = step[i-1].id`); falha/skip de um ancestral marca os seguintes como `skipped`. Logo a ordem do preset é semântica.
- Acrescentar preset = novo ficheiro + entrada em `PRESETS`. Zero alterações ao core (`_puppeteer_script.ts`).
