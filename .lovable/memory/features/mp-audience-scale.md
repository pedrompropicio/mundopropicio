---
name: MP Audience — motor "manter e escalar" (Etapa 4)
description: Edge function determinística que escala verba de adsets de prospecção (winning) para crescer volume, preservando o aprendizado. Irmã do motor cirúrgico.
type: feature
---

# MP Audience — manter e escalar

Etapa 4. Postura `manter_escalar` (classe `saudavel_subindo`). Irmã do motor
cirúrgico (Etapa 3): mesma infra, **regra oposta** — em vez de podar/realocar
(total constante), **escala verba** dos adsets de **prospecção** que estão a
ganhar, **inflando** o total para crescer volume. 100% determinístico, sem LLM.

## Edge function `crm-meta-campaign-scale`

**Input (POST):** `{ campaign_id: string, period_days?: number (default 30, 7..90) }`
Auth: user JWT (`verify_jwt = true`). Read-only + compute — não toca na Graph API.

**Reaproveita (idêntico ao surgical):** chamada à inventory server-to-server,
diagnóstico 360 + guarda de maturação (`isLearning`), cap de role
(`get_user_max_daily_budget_eur`), deteção `budgetMode` (ABO/CBO/unknown),
**contrato `ProposedAction`** e a **vista da UI**. Difere só na regra.

**Output:** mesmo shape do cirúrgico, com grupo executável **`scale_increase`**.
Resumo: `total_daily_before_cents`, `total_daily_after_cents` (**sobe**),
`total_increase_cents`, `eligible_count`, `scaled_count`, `cooldown_count`,
`cap_eur`, `learning_adsets_count`, `currency`, `counts`.

## Regras de escala (determinísticas)

Um adset **escala** (grupo `scale_increase`, executável) se TODAS:
1. `verdict === "winning"` (inventário);
2. `audience_type ∈ {broad, interest, lookalike}` (**prospecção**; retargeting/
   custom **nunca** escalam → recomendação informativa);
3. ROAS do adset `>= SCALE_ROAS_FLOOR` (G4);
4. ROAS **não** a cair forte: `roas_decay_pct >= -SCALE_DECAY_BLOCK_PCT` (G9);
5. **não** em learning (guarda de maturação);
6. **fora de cooldown**: último **aumento** de verba há `>= SCALE_COOLDOWN_DAYS` (G3/G6);
7. tem **headroom** sob o cap de role.

Falha em 4/5/6/7 → ação `blocked` com motivo (aparece desativada na UI).
**Quanto:** `proposed = current + round(current × SCALE_INCREASE_PCT)`, clamp ao cap.
`neutral` de prospecção com ROAS `>= floor` → recomendação ("a ganhar tração;
ainda sem volume — monitorizar", G5). A escala **infla** o total (objetivo).

**Cooldown (G3/G6):** lê `crm.meta_campaign_changes` `change_type='budget'`, por
adset a data mais recente em que a verba **subiu** (`after > before`). Reduções/
realocações do cirúrgico **não** contam.

## ABO vs CBO (G7)
- **ABO**: sobe `daily_budget_cents` por adset elegível. `total_after > total_before`.
- **CBO**: só escala o `daily_budget_cents` **da campanha** se for **prospecção
  pura** (nenhum retargeting E nenhum adset em learning) e houver ≥1 prospecção
  winning ≥ floor. Com mistura → **só recomendação** (escalar a campanha empurraria
  verba para retargeting/learning, violando as fronteiras).
- **unknown**: só recomendação.

## Constantes calibráveis (valores finais)
- `SCALE_INCREASE_PCT = 0.25` (G2)
- `SCALE_COOLDOWN_DAYS = 3` (G3)
- `SCALE_ROAS_FLOOR = 3.5` (G4 — sem cutoff superior)
- `SCALE_DECAY_BLOCK_PCT = 0.30` (G9)
- Teto v1 (G8): só cap de role + %/intervenção + cooldown (a aprovação ação-a-ação na UI é a salvaguarda; sem teto adicional de aumento total por run).

## Persistência (efémera)
Igual ao cirúrgico: nada persistido. Só as ações aplicadas vão ao audit via
`crm-meta-entity-action` (`meta_entity_actions_log` + `meta_campaign_changes`) com
`diagnosis_id` (360), `applied_action_index`, `triggered_by="ai_suggestion"`,
`reason_text` e `measure_impact_requested=true`. O `change_type='budget'` resultante
alimenta o cooldown da próxima execução.

## Extensão ADITIVA da inventory (G1)
`crm-meta-redesign-inventory` passou a expor `audience_type` em cada item de
`adsets_inventory` (via o `detectAudienceType` já existente). **Aditivo** — só
acrescenta o campo; não altera mais nada (redesign e surgical continuam iguais).
É a fonte única para distinguir prospecção de retargeting.

## UI (CampaignView)
- Cartão **"Manter e escalar"**: `kind: "scale"` (deixa de ser "Em breve"). CTA
  **"Ver ações de escala"** → `runScale()`. Recomendado em `saudavel_subindo`;
  alternativa em qualquer classe (aviso não-bloqueante).
- **Vista partilhada** com o cirúrgico (mesmo painel, parametrizado por
  `prescKind`): título/cor (verde p/ escala), resumo com **total/dia antes → depois
  (SOBE)** + aumento + elegíveis + cooldown + cap + learning. Grupos via
  `SURGICAL_GROUP_META` (acrescentado `scale_increase`). Cada ação com checkbox,
  badges de **verdict + audience_type**, `atual → proposto`, rationale; `blocked`
  desativadas com motivo; recomendações read-only.
- **"Aplicar selecionadas"**: sequencial, 1 `entity-action` por ação com audit; no
  fim invalida queries e re-corre a engine (com o `prescKind` ativo).
- Polish: `novo_desenho` continua "Em breve".

## Decisões G1–G9 (fechadas)
G1 inventory aditiva (audience_type). G2 +25%. G3 cooldown 3d. G4 floor 3.5x (sem
cutoff superior; "8x não escala" = o caso retargeting). G5 neutral de prospecção →
só recomendação. G6 cooldown conta só aumentos. G7 CBO só escala se prospecção
pura. G8 teto = cap+%+cooldown (sem teto de total/run). G9 não escalar winner com
`roas_decay_pct < -0.30`.

## Ficheiros
- `supabase/functions/crm-meta-campaign-scale/index.ts` — a engine.
- `supabase/functions/crm-meta-redesign-inventory/index.ts` — `audience_type` aditivo.
- `supabase/config.toml` — `[functions.crm-meta-campaign-scale] verify_jwt=true`.
- `src/pages/crm/CampaignView.tsx` — `kind: "scale"`, painel de prescrição
  partilhado (`prescKind`), `runScale`/`runPrescription`, grupo `scale_increase`.
