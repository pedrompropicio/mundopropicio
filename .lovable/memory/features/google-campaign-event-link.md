---
name: Vínculo campanha Google → evento
description: crm-google-publish-execute escreve linked_event_id + linked_event_locked; auto-link por nome só para campanhas criadas fora do ERP
type: feature
---

- Fonte de verdade do vínculo: `crm.google_campaign.linked_event_id` (+ `linked_event_locked`).
- **Campanhas criadas no ERP** (Issue #152, 2026-09-20): `crm-google-publish-execute`, logo após criar a campanha no Google, chama `linkCampaignToEvent()` e grava `linked_event_id = plan.event_id` com `linked_event_locked = true`. Se a linha de espelho ainda não existir (só o sync a cria), insere o mínimo (`connection_id`, `company_id`, `customer_id`, `external_campaign_id`, `name`, `status='PAUSED'`). Falha aqui nunca quebra a publicação — só `console.error`.
- **Campanhas criadas fora do ERP**: continuam a depender de `crm.auto_link_google_campaigns_to_events` (match por nome, score ≥ 2 tokens longos). Essa RPC ignora linhas com `linked_event_locked = true` — por isso não sobrescreve o vínculo do ERP.
- `crm-google-sync-campaigns` faz upsert de metadados sem as colunas `linked_event_*` → o vínculo trancado sobrevive ao sync.
- Limitação conhecida: eventos com um só token longo no nome ("SM - Lisboa", "SM - Porto") nunca ligam por nome. A correcção é o vínculo pelo plano, não mexer na função SQL.
