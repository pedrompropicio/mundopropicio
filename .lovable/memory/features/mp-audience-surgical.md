---
name: MP Audience — motor de intervenção cirúrgica (Etapa 3)
description: Edge function determinística que propõe ações (pausar/verba) sobre adsets/ads existentes a partir do diagnóstico 360 + inventário, preservando o aprendizado
type: feature
---

# MP Audience — intervenção cirúrgica

Etapa 3. Postura `intervencao_cirurgica` (classe `saudavel_caindo`). Em vez de
redesenhar (que reinicia o aprendizado), **poda e realoca** nos adsets/ads
**existentes**. 100% determinístico, sem LLM — re-runs idênticos.

## Edge function `crm-meta-campaign-surgical`

**Input (POST):** `{ campaign_id: string, period_days?: number (default 30, 7..90) }`
Auth: user JWT (`verify_jwt = true`). Read-only + compute — **não** toca na Graph API.

**Orquestração:**
1. Lê `meta_campaign_snapshot` (modo de verba, ids, currency).
2. Lê o **diagnóstico mais recente** de `crm.campaign_diagnosis_360` (fonte ÚNICA;
   nunca a tabela antiga `meta_campaign_diagnoses`). Sem diagnóstico → `422 no_diagnosis`.
   Extrai `source_campaign_class`, `recommended_posture`, e o **portão de maturação**
   (`maturation_gate.conversion_adsets[]` → mapa `external_adset_id → reached_threshold`).
3. Chama a **inventory** (`crm-meta-redesign-inventory`) server-to-server (URL
   absoluto, reencaminha `Authorization`+`apikey` — decisão G6). Daí vêm os
   **verdicts** (`winning/neutral/losing/saturated`) — **não recalculamos thresholds**.
4. Lê snapshots de adsets/ads (verba atual, `effective_status`, `connection_id`,
   `ad_account_id`) e o cap de role (`get_user_max_daily_budget_eur`).
5. Aplica as regras e devolve a **prescrição** (efémera).

**Output:**
```
{
  ok, campaign_id, diagnosis_id, source_campaign_class, recommended_posture,
  period_days, budget_mode: "ABO"|"CBO"|"unknown", generated_at,
  summary: {
    total_daily_before_cents, total_daily_after_cents,           // ABO: after <= before
    pool_freed_cents, pool_reallocated_cents, pool_unallocated_cents,
    cap_eur, learning_adsets_count, currency, counts{...}
  },
  proposed_actions: [{
    action_index,                       // estável 0..N → applied_action_index no audit
    group: "pause"|"reduce_budget"|"reallocate_increase"|"pause_ad"|"recommendation",
    executable, entity_type, external_id, connection_id, ad_account_id, entity_name,
    verdict, current_value_cents?, proposed_value_cents?,
    entity_action?: { action:"pause"|"update", updates?:{daily_budget_cents} },
    rationale, selected_by_default, blocked, blocked_reason?
  }]
}
```

## Regras determinísticas (verdict → ação)

| Verdict (inventário) | Ação | Executável | Verba |
|---|---|---|---|
| adset **losing** | pausar adset | sim (`pause`) | ABO: liberta toda a verba → pool |
| adset **saturated** | reduzir verba (ABO) + recomendação refresh | verba sim; refresh não | ABO: corta 30% → pool |
| adset **winning** | realocar do pool (ABO) | sim (`update`) | recebe, com teto |
| adset **neutral** | nenhuma | — | — |
| criativo **losing** | pausar ad(s) ACTIVE com esse `meta_creative_id` | sim (`pause`) | — |
| gaps / targeting | recomendação informativa (read-only) | não | — |

**Realocação (só ABO, passe único determinístico):**
`pool = Σ(verba dos losing pausados) + Σ(cortes dos saturated)`.
`share_i = pool · current_i / Σcurrent_winners`; `increase_i = min(round(share_i), teto_i)`,
com `teto_i = min(30% do current_i, espaço até ao cap de role)`. O excedente que
não couber **não é forçado** → `pool_unallocated` (a campanha gasta menos = poda).
Garante sempre `total_after ≤ total_before` (nunca infla).

**ABO vs CBO (G3):**
- **ABO** (Ivete): regras completas; pausar liberta verba → realoca para winners; total constante (ou menor).
- **CBO**: verba é da campanha. Só **pausar** (a Meta reconcentra). Saturated → só recomendação (não pausa). Sem realocação por adset.
- **unknown**: só pausas + recomendações.

**Maturação (D):** adset de conversão em learning (`reached_threshold=false`):
nunca recebe alterações de verba (ação marcada `blocked`); pausa-se só se for
`losing`; nunca recebe realocação.

**Cap de role:** pré-validado. `cap=0` → sem autoridade (nenhuma ação de verba;
reduções/realocações ficam `blocked`). `cap>0` → clamp; reduções aprofundam até
ao cap se a verba atual já o excedia. `cap=null` → sem limite. Nunca se propõe
verba que a `entity-action` recusaria.

## Constantes calibráveis (valores finais)
- `SATURATED_BUDGET_REDUCTION_PCT = 0.30` (G1)
- `REALLOC_MAX_INCREASE_PCT = 0.30` (G2 — teto por winner/intervenção; evita reset de learning)
- `MIN_ADSET_DAILY_CENTS = 100` (G5 — piso €1/dia; sem reduzir abaixo)

## Persistência (efémera)
A prescrição **não** é persistida (nenhuma tabela nova). Só as **ações aplicadas**
vão ao audit existente via `crm-meta-entity-action`: `meta_entity_actions_log` +
`meta_campaign_changes` com `diagnosis_id` (id do 360), `applied_action_index`,
`triggered_by="ai_suggestion"`, `reason_text` (a rationale) e
`measure_impact_requested=true` (G8). Reproduzível a qualquer momento a partir de
(diagnóstico 360 + inventário + snapshots).

## UI (CampaignView)
- O cartão **"Intervenção cirúrgica"** deixa de ser "Em breve" (`kind: "surgical"`).
  CTA **"Ver ações propostas"** → `runSurgical()` (chama a edge function).
  Disponível como **recomendado** (quando `saudavel_caindo`) e como **alternativa**
  em qualquer classe (com o aviso não-bloqueante da Etapa 2) — decisão G9.
- Vista agrupada (pausar adsets / reduzir verba / realocar para winners / pausar
  anúncios / recomendações), com resumo no topo (modo, total antes→depois, pool
  libertado/realocado/não-alocado, cap, nº adsets em learning).
- Cada ação executável tem **checkbox** (default = `selected_by_default`), badge de
  verdict, `atual → proposto`/dia, e rationale. Ações `blocked` desativadas com
  motivo. Recomendações read-only.
- **"Aplicar selecionadas"**: sequencial, 1 chamada `entity-action` por ação com os
  campos de audit acima; resultado por ação (toasts); no fim invalida queries e
  **re-corre a engine**.
- Polish Etapa 2: `manter_escalar` e `novo_desenho` continuam "Em breve"
  (desativado).

## Decisões G1–G9 (fechadas)
1. Corte saturated 30% (constante). 2. Realocação proporcional ao budget atual,
teto +30%/winner/intervenção; excedente → pool_unallocated. 3. CBO+saturated só
recomendação. 4. Criativo losing que é o último ad ativo do adset → avisar e
saltar (nunca deixar adset sem anúncios). 5. Piso €1/dia. 6. Engine chama a
inventory server-to-server. 7. `roas_average_floor` fora do v1. 8.
`measure_impact_requested=true` nas ações. 9. Cirúrgico disponível como
alternativa em qualquer classe, recomendado em `saudavel_caindo`.

## Ficheiros
- `supabase/functions/crm-meta-campaign-surgical/index.ts` — a engine.
- `supabase/config.toml` — registo `[functions.crm-meta-campaign-surgical] verify_jwt=true`.
- `src/pages/crm/CampaignView.tsx` — `kind: "surgical"`, estado + `runSurgical`/
  `applySurgical`, CTA nos cartões, vista de ações propostas.
