---
name: MP Audience — portão de maturação (learning phase)
description: Gate a montante da classificação no diagnóstico, que evita classificar como "fraca" uma campanha jovem ainda em learning phase
type: feature
---

# MP Audience — portão de maturação (learning phase)

## Problema

No diagnóstico (`crm-campaign-diagnosis`) uma campanha jovem em learning phase
(ROAS baixo por **imaturidade estatística**, não por fraqueza estrutural) era
classificada como `fraca` e encaminhada para redesign (`crm-meta-campaign-redesign`),
queimando o aprendizado já acumulado pelos adsets.

A régua da Meta para um adset **sair de learning** é ~50 eventos de **otimização**
por adset / 7 dias, ao nível do **adset** e do **evento que o adset optimiza**.

## Decisão

Adicionado um **portão de maturação** a **montante** da classificação por
nível/tendência (Fase 1D, `classifyCampaign`). É a primeira coisa a decidir a
classe — quando dispara, curto-circuita a classificação por ROAS.

### Recorte — só adsets de conversão (ALLOWLIST EXPLÍCITA)
Um adset só conta como "de conversão" se o seu `optimization_goal` estiver na
**allowlist explícita** abaixo. A fronteira é por allowlist, **nunca** por "tudo
o que não é awareness" — qualquer goal fora da allowlist é tratado como
NÃO-conversão (não entra na contagem nem dispara o portão). O `optimization_goal`
vem do `crm.meta_adset_snapshot` (a mesma leitura snapshot já usada pelo
wind-down, agora estendida para trazer também `optimization_goal`).

A leitura é guardada com `Object.hasOwn` — só chaves próprias da allowlist
contam (chaves herdadas de `Object.prototype`, ex. `constructor`, nunca passam).

**Allowlist final** `optimization_goal` → coluna de evento (`WindowMetrics`):

```
# presentes nos dados reais da conta (únicos goals de conversão que existem):
OFFSITE_CONVERSIONS                 -> purchases  (purchases_count)
VALUE                               -> purchases  (purchases_count)
# salvaguarda para o futuro (dentro da mesma allowlist explícita):
CONVERSIONS | PURCHASE              -> purchases  (purchases_count)
LEAD_GENERATION | QUALITY_LEAD | LEADS  -> leads  (leads_count)
ADD_TO_CART                         -> add_to_cart (add_to_cart_count)
INITIATE_CHECKOUT                   -> initiate_checkout (initiate_checkout_count)
```

**Fora da allowlist por design** (NÃO contam, NÃO disparam o portão):
`LANDING_PAGE_VIEWS` (128 adsets na conta — confirmado que **não** é tratado como
conversão), `LINK_CLICKS`, `IMPRESSIONS`, `REACH`, `THRUPLAY`,
`VISIT_INSTAGRAM_PROFILE`, `VIEW_CONTENT`, e qualquer goal não listado na
allowlist.

(Espelha `sumActions` em `crm-meta-sync-insights` e `CONVERSION_GOALS` em
`crm-meta-strategy-deploy`.)

### Contagem
Por adset de conversão, conta os eventos do **seu** goal na janela `last_7d` já
calculada (Fase 1B/1C). 100% determinística — sem LLM, sem Graph API. Re-runs
idênticos.

### Limiar
`LEARNING_EVENTS_THRESHOLD = 50` (constante calibrável em `crm-campaign-diagnosis`).

### Régua de decisão
- **Há >=1 adset de conversão** MAS **nenhum** atingiu o limiar de eventos em 7d
  → campanha **imatura**.
- Imatura → força `source_campaign_class = "em_maturacao"` e
  `recommended_posture = "aguardar_maturacao"`, curto-circuitando a classificação
  por ROAS.
- **Sem nenhum adset de conversão** → portão **não se aplica** (comportamento
  atual mantido; segue para `classifyCampaign`).

## Nova classe e postura
- `SourceCampaignClass` += `"em_maturacao"`.
- `RecommendedPosture` += `"aguardar_maturacao"`.
- `POSTURE_BY_CLASS["em_maturacao"] = "aguardar_maturacao"`.

A coluna `crm.campaign_diagnosis_360.source_campaign_class` é **`text`** (sem
enum em DDL — confirmado em `20260525193000_crm_campaign_diagnosis_360.sql`),
por isso o novo valor cabe sem alteração de schema.

## Bloco auditável
`maturation_gate` é incluído no `diagnosis_jsonb` (top-level e em
`levels.campaign.maturation_gate`):

```
{
  applies, is_immature, threshold,
  conversion_adsets_count,
  conversion_adsets: [
    { external_adset_id, optimization_goal, event_field, events_last_7d, reached_threshold }
  ],
  reason
}
```

## Fecho defensivo no redesign
`crm-meta-campaign-redesign`, no switch por classe (Fase 3A), tem um `case
"em_maturacao"` que faz **skip** (não redesenha), reaproveitando o mesmo shape de
stub de `"saudavel_subindo"`:
- `skip_reason = "campaign_in_learning_phase"` (novo membro de `SkipReason`).
- Mensagem: campanha em fase de aprendizagem; redesign reiniciaria o learning e
  queimaria os dados acumulados — aguardar maturação e re-diagnosticar.

## Ficheiros
- `supabase/functions/crm-campaign-diagnosis/index.ts` — constante, mapa, tipos,
  `computeMaturationGate`, `maturationClassification`, short-circuit da Fase 1D,
  leitura de `optimization_goal`, blocos auditáveis.
- `supabase/functions/crm-meta-campaign-redesign/index.ts` — `SkipReason` e `case
  "em_maturacao"` no switch de shape por classe.
