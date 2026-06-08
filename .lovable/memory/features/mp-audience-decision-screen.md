---
name: MP Audience — tela de decisão (CampaignView)
description: Secção "Diagnóstico & Decisão" da CampaignView — porta única adaptativa onde a postura recomendada molda as ações oferecidas (opção C)
type: feature
---

# MP Audience — tela de decisão (Diagnóstico & Decisão)

Etapa 2 do MP Audience. A antiga secção passiva "Diagnóstico IA" da
`src/pages/crm/CampaignView.tsx` passou a **tela de decisão**: porta única onde a
**postura recomendada** (diagnóstico 360) é destacada e todas as posturas
possíveis aparecem como cartões lado a lado (opção C: recomendação destacada +
alternativas). O utilizador escolhe a **AÇÃO**, nunca a classe.

## Diagnóstico on-demand
Botão "Diagnosticar agora" / "Re-diagnosticar" no cabeçalho da secção. Invoca
`crm-campaign-diagnosis` (mesmo padrão da `DiagnosisTest`):
`supabase.functions.invoke("crm-campaign-diagnosis", { body: { company_id,
external_campaign_id, target_roas } })` — `company_id` do snapshot da campanha,
`target_roas` = `diagnosis.target_roas ?? 8.0`. Estados de loading e erro
(toast). No fim invalida a query `crm-campaign-view-diagnosis` para refrescar.

## Mapeamento postura → ação (nomes reais de POSTURE_BY_CLASS)
Chaves batem exatamente com `POSTURE_BY_CLASS` em `crm-campaign-diagnosis`:

```
classe              -> recommended_posture     -> ação na UI (kind)
saudavel_subindo    -> manter_escalar          -> "Manter e escalar"      (coming_soon, Em breve)
saudavel_caindo     -> intervencao_cirurgica   -> "Intervenção cirúrgica" (coming_soon, Em breve)
fraca               -> redesign                -> "Redesenhar campanha"   (redesign, ATIVO -> wizard)
morta               -> novo_desenho            -> "Novo desenho"          (coming_soon, Em breve)
em_maturacao        -> aguardar_maturacao      -> "Aguardar maturação"    (info, sem fluxo + mensagem/métricas)
indeterminada       -> recolher_mais_dados     -> "Recolher mais dados"   (info, sem fluxo)
```

- **redesign**: botão ATIVO → `navigate("/audience/strategies/redesign/:campaignId")`
  (rota do wizard em `App.tsx`).
- **coming_soon** (Etapas 3-5): cartão visível com botão "Em breve" **desativado**.
- **info**: cartão com mensagem, sem fluxo de geração; métricas já visíveis no topo.
  Para `em_maturacao` mostra o bloco `maturation_gate` (nº de adsets de conversão,
  limiar 50 eventos/7d).

## Opção C — apresentação
- A postura **recomendada** é renderizada destacada (cartão com cor de acento +
  badge "Recomendado").
- As restantes posturas aparecem em grelha ("Outras ações"), clicáveis.
- Escolher uma alternativa **contra a recomendação** mostra um **aviso amBar não
  bloqueante**; quando a alternativa tem fluxo (redesign) o botão "Redesenhar
  mesmo assim" continua disponível. Coming_soon fica desativado; info sem ação.

## classMeta (cores das classes)
Acrescentado `em_maturacao` (tom **sky**, neutro/informativo — NUNCA vermelho, é
aprendizagem e não fraqueza) e `indeterminada` (neutro). `saudavel_caindo`
mantém-se (amber).

## Estado da unificação do diagnóstico (NÃO feita — plano proposto)
O `crm-meta-campaign-redesign` ainda depende da tabela **antiga**
`crm.meta_campaign_diagnoses`. Mapa de usos:

1. **Gate de entrada (422)** — `index.ts` L661-677: lê a diagnose (por
   `diagnosis_id` ou a mais recente); se não existir devolve
   `422 no_diagnosis`. Define `diagnosisId = diagnosis.id`.
2. **Prompt do LLM** — L1446 (`diagnosis.diagnosis_jsonb` fatiado a 12000 chars)
   e L1624 (`severity` + `overall_score`). **`severity` e `overall_score` NÃO
   existem** em `campaign_diagnosis_360` (que tem `source_campaign_class` e
   `projected_baseline_roas`).
3. **Persistência** — `source_diagnosis_id`/`diagnosis_id` gravados nas
   strategies (L1335, L1358, L2717, L2748, L2770). `source_diagnosis_id` é
   `uuid NULL` **sem FK** (migração 20260511223742) → não há constraint a partir.
4. Já existe uma chamada **server-to-server** a `crm-campaign-diagnosis` (360) na
   secção DIAG (L1053+), que devolve `diag360Id`, `source_campaign_class` e
   `projected_baseline_roas` — mas corre **depois** do gate 422.

**Porque NÃO foi substituída agora:** é extensa e arriscada — toca no prompt do
LLM (campos inexistentes no 360), exige reordenar o gate 422 para depois da
chamada server-to-server (ou substituí-lo por ela), e remapear `severity`/
`overall_score`. Decisão do Pedro pendente.

**Plano proposto:**
1. Mover/duplicar a chamada server-to-server `crm-campaign-diagnosis` para
   **antes** do gate; usar a sua resposta (`ok`, `diagnosis_id`,
   `source_campaign_class`, `projected_baseline_roas`, `diagnosis_jsonb`) como
   fonte única.
2. Substituir o gate 422: falha só se a chamada 360 não devolver diagnóstico
   utilizável.
3. No prompt, trocar `severity=…, score=…` por
   `classe=source_campaign_class, baseline=projected_baseline_roas` e usar o
   `diagnosis_jsonb` do 360.
4. `diagnosisId` → `diag360Id` em toda a persistência (`source_diagnosis_id`).
5. Depois de validado, deprecar leituras de `crm.meta_campaign_diagnoses` na
   redesign (manter a tabela até confirmar que nada mais a usa).

## Ficheiros
- `src/pages/crm/CampaignView.tsx` — `classMeta` (+em_maturacao/indeterminada),
  `postureMeta`/`postureAccent`/`POSTURE_ORDER`, estado `diagnosing`/`selectedAlt`,
  `runDiagnose`/`goRedesign`, secção "Diagnóstico & Decisão".
