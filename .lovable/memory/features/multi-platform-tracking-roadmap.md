---
name: Tracking multi-plataforma (event_trackers) — FEITO
description: public.event_trackers (evento × plataforma × tracker) é a fonte de verdade do pixel/conversão; D-ERP248
type: feature
---
# event_trackers — FEITO (D-ERP248, 11/10/2026)

`public.event_trackers` (event_id × platform 'meta'|'google'|'tiktok' × tracker_id,
`tracker_metadata jsonb`, UNIQUE (event_id, platform, tracker_id)) é a fonte de verdade
do tracker de cada evento. RLS por empresa + trigger que força `company_id` = empresa do
evento. UI: cartão "Trackers" do evento (pixel Meta, conversão Google, pixel TikTok).

- `crm-meta-strategy-deploy` lê daqui o `promoted_object`; **só sem linha** cai na
  inferência pelos adsets da campanha-fonte. A dívida DEBT(multi-platform) saiu do código.
- `events.meta_pixel_id` **fica** (portal/CAPI lêem-na) e é espelhada em event_trackers
  por trigger — gravar o pixel Meta faz-se na coluna do evento, não na tabela.
- Backfill inicial: 16 linhas 'meta'.
