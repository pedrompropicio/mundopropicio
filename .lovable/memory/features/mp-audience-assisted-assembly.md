---
name: MP Audience — Montagem Assistida (Camada 4, PARTE 1 — Motor)
description: Tabela crm.assisted_assembly + edge function crm-assisted-assembly-compute. Motor 100% determinístico que agrupa criativos por gatilho, calcula ROAS por adset e reparte 100% em pesos inteiros. SEM LLM.
type: feature
---

# Montagem Assistida — Motor (PARTE 1)

Camada 4 da feature "Montagem Assistida". Esta PARTE 1 é só o **motor**: tabela persistida + edge function determinística. UI e linguagem do LLM ficam para a PARTE 2.

## Princípio inviolável (P0)

O LLM **NUNCA** produz um número nesta feature. As proporções de investimento (`peso_pct`) são calculadas 100% em código. Re-correr a edge function com os mesmos inputs e os mesmos dados de insights TEM de dar pesos idênticos. Nesta PARTE 1 o LLM **não é sequer chamado**.

## Tabela `crm.assisted_assembly`

- `id`, `company_id`, `event_id`, `source_campaign_id?` (null em `from_scratch`)
- `flow` (`redesign|from_scratch`)
- `adsets jsonb` — array de adsets propostos (estrutura abaixo)
- `total_creatives int`
- `snapshot jsonb` — auditoria completa: parâmetros do gate, janela, agregados por adset
- `generated_by uuid?`, `generated_at timestamptz`
- Índices: `(event_id, generated_at DESC)`, `(company_id)`, `(source_campaign_id)`
- **Sem unique constraint** — insere sempre linha nova (histórico de montagens por evento; UI lê a mais recente).

RLS padrão crm (`current_company_id()`): `service_role_bypass` + `tenant_isolation_{select,insert,update,delete}`. Escrita permitida a `authenticated` e `service_role`.

### Estrutura de cada elemento de `adsets`
```json
{
  "trigger_id": "uuid|null",
  "trigger_nome": "Mudança de lote" | "Genéricos",
  "trigger_tipo": "escassez|antecipacao|narrativa|calendario|generico",
  "creative_ids": ["uuid", ...],
  "peso_pct": 60,
  "peso_origem": "roas|fallback_criativos",
  "roas_agregado": 4.2,
  "dias_dados": 9,
  "conversoes": 14,
  "fiavel": true
}
```

## ⚠️ DDL em Live

O Publish **não propaga DDL** neste projecto. A tabela existe em Test via migration `20260621*_assisted_assembly`; o Pedro tem de aplicar o mesmo DDL em Live manualmente.

## Edge Function `crm-assisted-assembly-compute`

Marcador (1ª linha do handler): `console.log("[assisted-assembly] BUILD_VERSION=assembly-compute-v1")`.

**Input (POST):**
```json
{ "company_id": "uuid", "event_id": "uuid", "flow": "redesign|from_scratch",
  "source_campaign_id": "uuid?", "creative_ids": ["uuid", ...] }
```
Agnóstica à origem dos criativos (mesmo padrão da Camada 2).

### Lógica determinística

1. **Valida pertença** ao company (lê evento via RLS do user).
2. **Elegibilidade**: lê `crm.creative_message_validation` para `(event_id, creative_ids)`. Criativos com `semaforo='contradiz'` (🔴) **ficam fora** e voltam em `excluidos_contradiz[]`. Só entram 🟢 e 🟡. Criativos sem registo de validação contam como genéricos e são listados em `snapshot.sem_validacao_creative_ids`.
3. **Agrupamento**: para os elegíveis com `aproveita_gatilhos=true`, atribui ao **1.º gatilho do `gatilhos_snapshot.available`** (determinístico por ordem). `aproveita_gatilhos=false` ou sem validação → adset **"Genéricos"** (`trigger_id=null`, `tipo=generico`).
4. **ROAS por adset** (janela de `JANELA_DIAS_INSIGHTS=30` dias). Cadeia de junção:
   `crm.meta_creatives.id` → `crm.meta_creatives.meta_creative_id` → `crm.meta_ad_snapshot.meta_creative_id` → `external_ad_id` → `crm.meta_ad_insights_daily.external_ad_id`.
   Por adset agrega `spend_cents`, `purchases_value_cents`, `purchases_count`, dias distintos com insight.
   `roas_agregado = sum(purchases_value)/sum(spend)`, 2 casas.
5. **Gate de fiabilidade (POR ADSET, não pela campanha)**:
   `fiavel = (dias_dados >= MIN_DIAS_FIAVEL) AND (conversoes >= MIN_CONVERSOES_FIAVEL)`.
   Constantes nomeadas: `MIN_DIAS_FIAVEL=7`, `MIN_CONVERSOES_FIAVEL=10`.
6. **Pesos (somam exactamente 100):**
   - Se há pelo menos um adset fiável **E** há imaturos: grupo fiável fica com `QUOTA_GRUPO_FIAVEL=0.7` do total e grupo imaturo com `QUOTA_GRUPO_IMATURO=0.3`. Dentro de cada grupo, a quota é repartida proporcionalmente ao peso bruto (ROAS para os fiáveis, nº de criativos para os imaturos). Isto evita que a diferença de escala (ROAS ~1-8 vs contagem ~1-5) distorça a comparação.
   - Se só existe um grupo: leva 100% repartido proporcionalmente ao peso bruto.
   - Se **nenhum** adset é fiável (fallback global): todos por nº de criativos, `peso_origem='fallback_criativos'`.
   - Arredondamento: cada peso a inteiro; a diferença para somar 100 vai para o adset com maior peso.
7. **Persistência**: `INSERT` em `crm.assisted_assembly` (nunca upsert — histórico). Resposta inclui `assembly_id`, `adsets`, `total_creatives`, `excluidos_contradiz`, `snapshot`.

### Determinismo

Sem LLM. Sem `now()` a influenciar pesos. A janela é fixa (30 dias rolling) e o snapshot grava `janela_insights.desde/ate` para auditoria. Dois runs no mesmo dia com os mesmos inputs e os mesmos dados de insights/validações produzem pesos idênticos.

## Próximos passos (PARTE 2 — fora desta tarefa)

UI (CampaignView) para visualizar a montagem mais recente e fluxo `redesign`/`from_scratch`. A linguagem (títulos, descrições por adset, etc.) pode ser gerada por LLM, mas os **números** continuam sempre a vir desta tabela.
