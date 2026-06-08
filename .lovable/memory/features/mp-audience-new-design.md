---
name: MP Audience — novo desenho do zero (Etapa 5)
description: Postura para campanhas mortas — cria uma campanha de raiz a partir do evento, herdando seletivamente criativos/audiências da campanha morta e dos peers do mesmo evento.
type: feature
---

# MP Audience — novo desenho do zero

Etapa 5. Postura `novo_desenho` (classe `morta`, só quando `projected_baseline_roas ~ 0`).
**Compõe** a estrutura-do-evento da `generate` + a herança seletiva da `redesign` +
um pool agregado morta+peers. O `generated_plan` segue o **schema da redesign** e é
deployado pelo `crm-meta-strategy-deploy` **existente, sem alterações**.

## Edge function `crm-meta-campaign-new-design`

**Input (POST):**
```
{ campaign_id (morta), goal_revenue_eur, ticket_avg_eur, total_budget_eur?,
  target_roas? (default 9), country_codes? (["PT","BR"]), user_notes?, strategy_name?,
  inheritance_decisions?: { inherit_creative_ids?, discard_creative_ids?,
                            new_creatives_to_generate?, new_audiences_to_create? } }
```
Auth: user JWT (`verify_jwt = true`) + LLM.

**Fluxo:**
1. Carrega a campanha morta (snapshot) → `linked_event_id`. **G5:** sem evento → `422 no_linked_event`.
2. Token decifrado (`crm_get_meta_decrypted_token`) + ad account.
3. Evento (`events`) + dias até evento + artista detetado.
4. Diagnóstico 360 mais recente → `source_diagnosis_id` (**G9**; nunca a tabela antiga).
5. **Pool de herança** via `crm-meta-redesign-inventory` com `event_id` (s2s) →
   `event_inheritance_pool` (criativos+audiências da morta + peers, dedup por
   `meta_creative_id`, com verdict). Cross-event learnings (ROAS/spend dos peers 30d).
6. **Herança seletiva:** `inheritedCreatives` = pool ∩ `inherit_creative_ids`. Sem
   decisões → vazio → plano 100% novo.
7. Contexto Graph (top performers 90d, custom audiences, interesses, pixels) — como a `generate`.
8. **Prompt** = estrutura-do-evento (generate) + bloco de criativos herdados + decisões +
   cross-event learnings; **schema de saída = o da redesign** (`recommended_campaigns[]
   .adsets[].ads[]` com `existing_creative_id`|`creative_brief`).
9. LLM (gemini-2.5-flash) → parse → `normalizePlanInPlace` + `resolveInterestsInPlace` +
   `resolveCustomLocationsInPlace`.
10. **Herança pós-LLM (COPIADO da redesign):** `plan.inherited_creatives`; validar
    `existing_creative_id` contra o set escolhido (strip inválidos); fallback (distribui
    herdados se a IA não usou nenhum); enforce (só criativos aprovados).
11. Persiste em `crm.meta_campaign_strategies` (`status='generated'`,
    `source_campaign_id`=morta, `event_id`=linked_event_id, `inheritance_decisions`,
    `source_diagnosis_id`). Devolve `strategy_id` + `plan`.

**Output:** `{ strategy_id, event, source_campaign_id, source_diagnosis_id, inherited_count, pool_count, plan }`.

## Extensão ADITIVA da inventory (G3)
`crm-meta-redesign-inventory` aceita agora `event_id` opcional. Quando presente,
devolve, **além** do output normal, `event_inheritance_pool` (criativos+audiências
agregados across as campanhas do evento, com verdict escalado pelo spend do evento).
Quando ausente, o output é **idêntico** ao atual → redesign/surgical/scale intocados.

## Deploy (sem alterações)
O `crm-meta-strategy-deploy` já consome `recommended_campaigns[].adsets[].ads[]`:
`existing_creative_id` → reusa o criativo na Meta (`{creative_id}`); `creative_brief`
→ cria criativo novo. O novo desenho emite exatamente este shape (como a redesign).

## UI
- `CampaignView`: cartão **"Novo desenho"** passa de `coming_soon` → `kind:"new_design"`,
  CTA **"Desenhar do zero"** → `/audience/strategies/new-design/:campaignId`. Recomendado
  em `morta`; alternativa em qualquer classe com o aviso não-bloqueante (**G8**). Já **não
  há cartões "Em breve"**: só `aguardar_maturacao`/`recolher_mais_dados` são info (sem CTA).
- `StrategyNewDesign.tsx` (route novo, **G7**): inputs de objetivo (campos da `StrategyNew`) +
  seleção de herança do pool (winning pré-selecionados; **G4** losing atrás de "mostrar todos";
  não selecionar nada → 100% novo). Chama `crm-meta-campaign-new-design` → navega para
  `/audience/strategies/:id` (revisão + deploy existentes).

## Decisões G1–G9 (fechadas)
G1 função nova `crm-meta-campaign-new-design`. G2 **copiar** a herança da redesign (NÃO
extrair para `_shared` agora; redesign intocada). G3 `event_id` aditivo na inventory. G4
pool mostra winning+neutral; losing atrás de "mostrar todos". G5 morta sem evento → bloquear
com CTA. G6 inputs de objetivo na UI (sizing ao investimento FORA). G7 route novo reutilizando
StrategyNew/Redesign. G8 alternativa em qualquer classe. G9 `source_diagnosis_id` = id do 360.

## Dívida técnica
- **Consolidar a herança em `_shared`**: a lógica de recolha/validação/fallback de
  `existing_creative_id` está agora DUPLICADA (redesign + new-design). Consolidar num
  `_shared/inherit-creatives.ts` **junto com a unificação do diagnóstico na redesign**
  (a redesign ainda usa a tabela antiga `meta_campaign_diagnoses`; a new-design já usa o 360).
- Fora de âmbito (sinalizado): objetivos Meta 2024 no prompt e error-logging do deploy
  afetam qualquer plano (incl. novo desenho).

## Ficheiros
- `supabase/functions/crm-meta-campaign-new-design/index.ts` — a função.
- `supabase/functions/crm-meta-redesign-inventory/index.ts` — `event_id`/`event_inheritance_pool` (aditivo).
- `supabase/config.toml` — `[functions.crm-meta-campaign-new-design] verify_jwt=true`.
- `src/pages/crm/StrategyNewDesign.tsx` — wizard novo.
- `src/pages/crm/CampaignView.tsx` — `kind:"new_design"` + CTA `goNewDesign`.
- `src/App.tsx` — route `strategies/new-design/:campaignId`.
