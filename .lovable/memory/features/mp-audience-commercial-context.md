---
name: MP Audience — Contexto Comercial do Evento (Camada 1)
description: Fundação da feature "Montagem Assistida" — tabelas crm.event_commercial_context + log com trigger e painel manual na CampaignView
type: feature
---

# Contexto Comercial do Evento

Camada 1 (fundação) da feature maior "Montagem Assistida". Informação declarada e mantida **100% manualmente** pelo utilizador, por evento, que descreve o estado comercial actual da venda de bilhetes. Independente de `event_ticket_lots` e demais tabelas de bilheteira — não lê nem pré-carrega nada delas.

Camadas seguintes (NÃO incluídas nesta camada): validação de mensagem de criativos, montagem assistida, alimentação do diagnóstico.

## Schema (Live + Test)

### `crm.event_commercial_context` — 1 linha por evento (estado actual)
- `event_id uuid UNIQUE` → `public.events(id)` ON DELETE CASCADE
- `company_id uuid NOT NULL` (multi-tenant)
- `lote_atual text` (livre, ex.: "Lote 2 de 3")
- `virada_iminente boolean default false`
- `virada_data date` (só preenchida quando `virada_iminente = true`)
- `preco_atual numeric` + `moeda text` (ex.: "EUR", "BRL")
- `angulo_fase text` (ex.: "esgotamento gradual, sem urgência de data")
- `notas text`
- `updated_by uuid`, `created_at`, `updated_at`

### `crm.event_commercial_context_log` — append-only
- `context_id uuid` → contexto principal
- `event_id`, `company_id`, `changed_by`, `changed_at`
- `old_state jsonb` (null no insert), `new_state jsonb`

## Trigger de log (garantia de BD, não da aplicação)

`crm.event_commercial_context_write_log()` — `SECURITY DEFINER`, `AFTER INSERT OR UPDATE`. Escreve sempre uma entrada no log com `old_state`/`new_state` em JSONB. A aplicação **nunca** escreve directamente em `event_commercial_context_log`.

`crm.event_commercial_context_set_updated_at()` — `BEFORE UPDATE`, mantém `updated_at = now()`.

## RLS (padrão crm)

Igual a `crm.meta_campaign_diagnoses`:
- `service_role_bypass` (ALL, true/true)
- `tenant_isolation_select|insert|update|delete` para `authenticated` com `company_id = current_company_id()`

Log: só `SELECT` para `authenticated` no mesmo company; escrita exclusivamente via trigger (SECURITY DEFINER).

## Painel UI

Componente: `src/components/crm/EventCommercialContextCard.tsx`

Ponto de entrada: `src/pages/crm/CampaignView.tsx` — cartão "Contexto Comercial do Evento" colocado antes do "Histórico" da campanha. Opera sobre `campaign.linked_event_id` (de `crm.meta_campaign_snapshot`). Quando `linked_event_id` é `null`, mostra estado vazio: "Campanha sem evento associado — associe um evento para definir o contexto comercial."

- Form com todos os campos; toggle `virada_iminente` esconde/mostra `virada_data`.
- `upsert` por `event_id` (uma linha por evento).
- "Última actualização" relativa (date-fns + locale pt).
- Secção colapsável "Histórico" com últimas 10 entradas do log e diff campo a campo (só leitura).

Tudo em PT-PT, segue design system da CampaignView.

## Notas

- Sem edge function — painel fala directamente com a tabela via supabase-js (RLS aplica). Sem marcador `BUILD_VERSION` por isso.
- Não tocar no diagnóstico (`crm-campaign-diagnosis`) nem no redesign nesta camada.
