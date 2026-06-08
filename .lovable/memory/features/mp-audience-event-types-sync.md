---
name: MP Audience — tipos de evento + sync de criativos por campanha
description: Estrutura de eventos (simple/multi_day/festival + hierarquia parent_event_id), regra da "última data efetiva", e o critério do sync de criativos (todas as campanhas exceto eventos passados).
type: feature
---

# Tipos de evento + sync de criativos por campanha

## Porque é que o sync NÃO filtra por evento ativo
Os **criativos pertencem às CAMPANHAS** (criativo → anúncio → campanha). A ligação
campanha → evento (`crm.meta_campaign_snapshot.linked_event_id`) é **conceitual**
(organização/análise) e **não condiciona a existência dos criativos**. Por isso o
sync de criativos (`crm-meta-sync-creatives`) deixou de filtrar por "eventos
ativos" e passa a sincronizar criativos de **TODAS as campanhas, EXCETO as ligadas
a eventos que JÁ OCORRERAM**.

Distinção importante:
- **O sync** não filtra por evento (só exclui o que é claramente passado).
- **A herança** (pool de criativos na criação de campanha do zero — Etapa 5,
  `crm-meta-campaign-new-design` via `crm-meta-redesign-inventory` com `event_id`)
  **sim** agrupa criativos por evento — por osmose através da campanha
  (`linked_event_id`). É essa relação criativo→evento (via campanha) que alimenta o
  pool de herança. O sync garante que os criativos existem em DB; a herança decide
  quais reaproveitar para um evento concreto.

## Tipos de evento (public.events.event_type)
`event_type` ∈ **{ `simple`, `multi_day`, `festival` }** (default `simple`).
Hierarquia via `parent_event_id`:
- **`simple`** — evento único (uma data, um local).
- **`multi_day`** — turnê/multi-cidade: um **pai** `multi_day` agrupa **filhos**
  (tipicamente `simple`/`festival`), cada filho com a **data real** da sua
  cidade/dia. Os filhos têm `parent_event_id` a apontar para o pai.
- **`festival`** — pode ser filho de um pai (multi-dia) ou ele próprio um agrupador.

⚠️ **`events.date` do PAI não é fiável** — fica com a data de criação. A data real
de um multi_day/festival vive nos **filhos**.

## Regra da "última data efetiva"
Para decidir se um evento já ocorreu:
- Se o evento **tem filhos** (`parent_event_id` a apontar para ele) →
  **`MAX(date dos filhos)`**.
- Senão → o **próprio `date`**.

**Evento já ocorrido** = `status = 'completed'` **OU** última data efetiva
`< CURRENT_DATE`. (Sem data e não-`completed` → indeterminado → tratado como NÃO
passado, conservador: inclui.)

Exemplos:
- Pai multi_day com filhos em fev e out: última efetiva = out → passado só depois
  de out, mesmo que o `date` do pai seja antigo.
- Campanha ligada diretamente a um filho de fev: o filho usa o **próprio** date
  (fev) → passado, excluído — mesmo que a turnê continue noutras cidades.

## Critério do sync (`exclude_past_events`, default true)
1. Calcula `pastEventIds` (eventos passados pela regra acima) entre os eventos
   ligados às campanhas da company.
2. `pastCampaignSet` = campanhas com `linked_event_id ∈ pastEventIds`.
3. Step A (set-diff) percorre `meta_ad_snapshot` (paginado, range 1000) e **exclui**
   os ads cuja campanha está em `pastCampaignSet`. Um **criativo entra se aparecer
   em pelo menos uma campanha NÃO passada** (campanha sem evento conta como não
   passada). Só fica de fora o criativo cujas campanhas são **TODAS** de eventos
   passados.
4. `exclude_past_events=false` → sync total (sem exclusão).

Substitui o antigo `active_events_only` (que incluía só eventos `status='active'
AND date >= hoje` — demasiado restritivo: deixava de fora campanhas sem evento e
campanhas de eventos futuros mas não marcados `active`).

## Pré-requisito de permissões
O cron corre como `service_role`, que precisa de `SELECT` nas tabelas consultadas
no Step 0: `crm.meta_campaign_snapshot` e `public.events` (ver migration
`20260608010000_grant_sync_creatives_event_aware.sql`).

## Ficheiros
- `supabase/functions/crm-meta-sync-creatives/index.ts` — Step 0 (exclusão de
  passados) + Step A (varrimento paginado com exclusão em memória).
- `supabase/manual/fix_cron_meta_sync_creatives_live.sql` — cron passa
  `exclude_past_events=true`.
- `docs/integrations/meta-creatives-sync.md` §12 — detalhe operacional.
