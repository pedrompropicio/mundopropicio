---
name: MP Audience — Montagem Assistida (Camada 4)
description: Motor determinístico (PARTE 1) + UI e linguagem por LLM (PARTE 2). Tabela crm.assisted_assembly + edge functions crm-assisted-assembly-compute (motor) e crm-assisted-assembly-narrate (linguagem). Componente AssistedAssemblyPanel.
type: feature
---

# Montagem Assistida — Camada 4 (PARTE 1 + PARTE 2)

Camada 4 da feature "Montagem Assistida". Composta por:
- **PARTE 1 — motor**: tabela + edge function determinística que calcula proporções de investimento por adset.
- **PARTE 2 — linguagem + UI**: edge function de narrativa por adset (LLM só cita números do motor) + componente `AssistedAssemblyPanel` (passo dedicado a tela cheia).

## Princípio inviolável (P0)

O LLM **NUNCA** produz um número nesta feature. As proporções (`peso_pct`) são calculadas 100% em código (motor). O LLM da PARTE 2 **só** pode citar os números exactos que recebe no input (`peso_pct`, `roas_agregado`, `conversoes`, `dias_dados`, `n_criativos`). Se um número não está no input, não pode aparecer no texto. A fonte da verdade dos números é a tabela; o texto do LLM é só a moldura à volta.

A UI também respeita o P0: a barra de proporção usa **exclusivamente** os `peso_pct` vindos do motor. Edições no cliente (remover adset/criativo) **NÃO** recalculam pesos — mostram um aviso "Montagem editada" e exigem "Voltar a montar" para reinvocar o motor.

## Tabela `crm.assisted_assembly`

- `id`, `company_id`, `event_id`, `source_campaign_id?` (null em `from_scratch`)
- `flow` (`redesign|from_scratch`)
- `adsets jsonb` — array de adsets propostos (estrutura abaixo)
- `total_creatives int`
- `snapshot jsonb` — auditoria completa: parâmetros do gate, janela, agregados por adset
- `generated_by uuid?`, `generated_at timestamptz`
- Índices: `(event_id, generated_at DESC)`, `(company_id)`, `(source_campaign_id)`
- **Sem unique constraint** — insere sempre linha nova (histórico de montagens por evento; UI lê a mais recente).

RLS padrão crm (`current_company_id()`): `service_role_bypass` (`TO service_role`) + `tenant_isolation_{select,insert,update,delete}`. Escrita permitida a `authenticated` e `service_role`.

### Correcção de drift Test↔Live (2026-06-21)

A migration original da PARTE 1 criou `service_role_bypass` como `FOR ALL TO public` em Test. Live foi corrigido manualmente para `TO service_role`. A migration `20260621*_fix_assisted_assembly_service_role` alinha Test (DROP + CREATE com `TO service_role`).

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

O Publish **não propaga DDL** neste projecto. A tabela existe em Test via migration `20260621*_assisted_assembly`; o Pedro tem de aplicar o mesmo DDL em Live manualmente. O ajuste de policy `service_role_bypass` da correcção de drift também precisa ser aplicado em Live se ainda não estiver.

## Edge Function `crm-assisted-assembly-compute` (motor)

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
   - Se há pelo menos um adset fiável **E** há imaturos: grupo fiável fica com `QUOTA_GRUPO_FIAVEL=0.7` do total e grupo imaturo com `QUOTA_GRUPO_IMATURO=0.3`. Dentro de cada grupo, a quota é repartida proporcionalmente ao peso bruto (ROAS para os fiáveis, nº de criativos para os imaturos).
   - Se só existe um grupo: leva 100% repartido proporcionalmente ao peso bruto.
   - Se **nenhum** adset é fiável (fallback global): todos por nº de criativos, `peso_origem='fallback_criativos'`.
   - Arredondamento: cada peso a inteiro; a diferença para somar 100 vai para o adset com maior peso.
7. **Persistência**: `INSERT` em `crm.assisted_assembly` (nunca upsert — histórico). Resposta inclui `assembly_id`, `adsets`, `total_creatives`, `excluidos_contradiz`, `snapshot`.

### Determinismo

Sem LLM. Sem `now()` a influenciar pesos. A janela é fixa (30 dias rolling) e o snapshot grava `janela_insights.desde/ate` para auditoria.

## Edge Function `crm-assisted-assembly-narrate` (linguagem — PARTE 2)

Marcador (1ª linha do handler): `console.log("[assembly-narrate] BUILD_VERSION=assembly-narrate-v1")`.

**Input (POST):** `{ "company_id": "uuid", "assembly_id": "uuid" }`

**Output:**
```json
{
  "assembly_id": "uuid",
  "analysis_model": "google/gemini-2.5-flash",
  "narrativas": [
    { "trigger_id": "uuid|null", "trigger_nome": "Mudança de lote", "texto": "1-2 frases em PT-PT" }
  ]
}
```

### Lógica

1. Valida pertença ao company (lê `crm.assisted_assembly` via service_role e o evento via RLS do user).
2. Lê `adsets[]` directamente da linha persistida (fonte da verdade dos números).
3. Para **cada adset**, chama Gemini (`google/gemini-2.5-flash`, temperature 0.1, retry 429, trata 402) via Lovable AI Gateway. Mesmo padrão de `crm-validate-creative-messages` e `LOVABLE_API_KEY`.
4. Devolve `narrativas[]` (1 por adset). **Não persiste** — narrativa é efémera e regenerável. Em caso de erro do LLM, usa **fallback determinístico** local que também só cita os números do input.

### Regras duras no prompt do LLM

- Só pode citar os números exactos do bloco "DADOS DO ADSET" (`peso_pct`, `roas_agregado`, `conversoes`, `dias_dados`, `n_criativos`). NUNCA inventa, calcula, arredonda, soma ou deriva outro número.
- Se `peso_origem='roas'` (fiável): justifica com `roas_agregado` (com "x") e `conversoes`.
- Se `peso_origem='fallback_criativos'` (imaturo / fallback global): justifica APENAS com `n_criativos` por ainda **não** haver dados suficientes. NUNCA apresenta o `roas_agregado` deste caso como se fosse fiável.
- Linguagem honesta: nunca promete resultados, nunca afirma causalidade.

## Componente `AssistedAssemblyPanel` (UI — PARTE 2)

Ficheiro: `src/components/crm/AssistedAssemblyPanel.tsx`.

**Props:** `{ open, onOpenChange, eventId, companyId, flow: 'redesign'|'from_scratch', sourceCampaignId?, creativeIds: string[] }`.

**Comportamento:**
1. Botão "Montar com assistente" (só a pedido — não automático, poupa LLM/compute). Invoca o motor + a narrativa em sequência.
2. Renderiza um bloco por adset com **barra/accent à esquerda colorida por tipo de gatilho** (escassez=âmbar, antecipacao=azul, narrativa=roxo, calendario=cinza, generico=cinza).
3. **Badge de origem do peso (transparência total):** `peso_origem='roas'` → badge verde "performance · ROAS Xx"; `peso_origem='fallback_criativos'` → badge âmbar "sem dados suficientes". Permite ver de relance qual peso é performance e qual é fallback.
4. **Barra de proporção** horizontal segmentada usando exclusivamente os `peso_pct` do motor (não os adsets visíveis após edição). Frase fixa por baixo: *"Proporção sobre a verba que definires · tu aplicas o valor."*
5. **Aviso de excluídos por contradição (🔴):** bloco vermelho destacado (bloqueio leve) com a lista dos criativos deixados de fora. Não os inclui automaticamente — só avisa.
6. **Edição local:** permite remover adset inteiro ou criativos individuais (estado local). NÃO recalcula no cliente — mostra aviso amarelo "Montagem editada — volta a montar para recalcular as proporções" e o botão muda para "Voltar a montar".
7. Aberto em `Sheet` lateral a tela cheia (`sm:max-w-3xl`), reutilizado nos dois fluxos.

**Ponto de entrada:** `src/pages/crm/CampaignView.tsx` — cartão "Montagem Assistida" logo após o `StrategicTriggersCard`, com dois botões: "Montar como redesenho" (`flow='redesign'`, `sourceCampaignId=external_campaign_id`) e "Montar do zero" (`flow='from_scratch'`, `sourceCampaignId=null`). Os `creativeIds` são os mesmos que alimentam a Camada 2 nesta página.

## Garantias

- ✅ O LLM em momento nenhum produz um número — só cita os recebidos no input (com fallback determinístico no servidor).
- ✅ A barra de proporção da UI usa exclusivamente `peso_pct` vindos do motor.
- ✅ Edições locais não recalculam — exigem reinvocar o motor.
- ✅ Criativos `contradiz` (🔴) nunca entram numa montagem.
