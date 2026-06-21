---
name: MP Audience — Estúdio de Desenho de Campanha (Camada 5, PARTE 1 — motor)
description: Tabela crm.campaign_design + edge function crm-campaign-design-generate. LLM escreve textos de anúncio mas cada variação nasce já validada contra os gatilhos activos (lógica da Camada 2). Pesos vêm da Camada 4 e não são recalculados.
type: feature
---

# Estúdio de Desenho de Campanha — Camada 5, PARTE 1 (motor)

Veste a montagem da Camada 4 com **textos** e **escolha de imagem** por adset. A UI vem na PARTE 2.

## Princípio inviolável (P0)

O LLM passa a ser AUTOR de texto — mas:

- **Cada** variação de texto que o LLM escreve é **imediatamente auto-classificada** segundo a MESMA lógica da Camada 2 (`coerente|atencao|contradiz` + `aproveita_gatilhos` + `explicacao_validacao`). Nasce já com semáforo.
- O LLM só pode afirmar o que um **gatilho activo disponível** respalda. Lista determinística no prompt.
- **Regra dura de urgência temporal** (no prompt): alegações de tempo imediato (hoje, últimas horas, agora, termina já, acaba hoje) **só** são permitidas se existir um gatilho activo do tipo `calendario` OU `contagem_regressiva` dentro de validade. Um gatilho de `escassez` (ex.: Mudança de lote) autoriza falar de subida de preço / virada, mas **não** de horas/hoje.
- Os **números** (pesos `peso_pct`, adsets) vêm da Camada 4 e **NÃO são recalculados aqui**. Esta camada só veste com linguagem e escolha de imagem.

## Tabela `crm.campaign_design`

- `id`, `company_id`, `event_id`, `assembly_id` (uuid; FK conceptual a `crm.assisted_assembly.id`, sem `REFERENCES` para não prender)
- `adsets jsonb NOT NULL` — array (estrutura abaixo)
- `estado text` CHECK in (`'rascunho'`, `'finalizado'`) default `'rascunho'`
- `generated_by uuid?`, `generated_at`, `updated_at` (trigger)
- Índices: `(event_id)`, `(company_id)`, `(assembly_id)`. **Sem unique** — histórico.

RLS padrão crm: `service_role_bypass FOR ALL TO service_role` (atenção — **não** `TO public`, evita o bug da `assisted_assembly`) + `tenant_isolation_{select,insert,update,delete}` com `company_id = current_company_id()`.

### Estrutura de cada elemento de `adsets`
```json
{
  "trigger_id": "uuid|null",
  "trigger_nome": "Mudança de lote",
  "trigger_tipo": "escassez|antecipacao|narrativa|calendario|generico",
  "peso_pct": 70,
  "pecas": [
    { "creative_id": "uuid", "incluida": true, "motivo_escolha": "porquê" }
  ],
  "variacoes_texto": [
    {
      "headline": "...", "corpo": "...", "cta": "SHOP_NOW",
      "semaforo": "coerente|atencao|contradiz",
      "aproveita_gatilhos": true,
      "explicacao_validacao": "porque deu este semáforo",
      "escolhida": false
    }
  ]
}
```

## ⚠️ DDL em Live

Publish **não propaga DDL**. A tabela existe em Test via migration `20260621*_campaign_design`; o Pedro tem de aplicar o mesmo DDL em Live à mão.

## Edge Function `crm-campaign-design-generate`

Marcador (1ª linha do handler): `console.log("[campaign-design] BUILD_VERSION=design-generate-v1")`.

**Input (POST):** `{ "company_id": "uuid", "assembly_id": "uuid" }`

### Lógica
1. Valida pertença ao company (lê o `event_id` da assembly via service_role; valida o evento via RLS do user).
2. Lê `crm.assisted_assembly` por `assembly_id` → `adsets[]` (`trigger_id`, `trigger_nome`, `trigger_tipo`, `peso_pct`, `creative_ids`).
3. Lê gatilhos do evento via `crm.event_active_triggers` + `strategic_trigger_catalog`. Selecção 100% determinística (igual Camada 2): **disponíveis** = `estado='activo'` AND (`validade IS NULL` OR `validade >= hoje`); **expirados** = `estado='expirado'` OR `validade < hoje`.
4. Para cada `creative_id` lê `crm.meta_creatives` (`name, type, headline, body, cta_type, file_url, width, height, duration_seconds, analysis_jsonb`). A `analysis_jsonb` informa a escolha de imagem.
5. **Escolha de peças (LLM):** por agora todas com `incluida=true`; o LLM apenas anota `motivo_escolha` curto por peça (selecção mais selectiva fica para iteração futura).
6. **Geração + auto-validação (LLM, uma chamada por adset):** Gemini `google/gemini-2.5-flash` via Lovable AI Gateway (mesmo padrão de `crm-validate-creative-messages`), `temperature=0.4`, retry 429, trata 402, `LOVABLE_API_KEY`. Devolve 2-3 variações `{ headline, corpo, cta, semaforo, aproveita_gatilhos, explicacao_validacao }`. O prompt obriga a auto-classificar cada variação segundo as MESMAS regras da Camada 2.
7. **Persistência:** `INSERT` em `crm.campaign_design` (sempre linha nova — histórico), `estado='rascunho'`, todas as variações com `escolhida=false`.
8. Resposta: `{ design_id, assembly_id, adsets, contagem: { adsets, variacoes_total } }`.

### Regras duras no prompt (geração + auto-validação)
- Só afirmar o que está na lista de gatilhos disponíveis (factuais identificados).
- Urgência temporal (hoje/agora/últimas horas/termina já/acaba hoje) **só** com gatilho activo de `calendario` OU `contagem_regressiva` dentro de validade. Escassez (ex.: virada de lote) autoriza falar de subida de preço/virada, **não** de horas/hoje.
- Nunca inventar preços, datas, lugares ou outros factos comerciais não respaldados.
- PT-PT, CTAs do conjunto Meta (`SHOP_NOW`, `LEARN_MORE`, `GET_OFFER`, `BOOK_TRAVEL`, `SIGN_UP`, …).
- Auto-classificar cada variação: `contradiz` se afirma algo sem respaldo (ou contra um expirado); `coerente`+`aproveita_gatilhos=true` se usa um disponível; `coerente`+`aproveita_gatilhos=false` se é genérica.

## Garantias

- ✅ Cada variação nasce **já com semáforo** (auto-classificado pelo LLM segundo as regras da Camada 2; selecção de disponíveis/expirados é determinística em código).
- ✅ Regra de urgência temporal (calendário/contagem) está no prompt.
- ✅ Pesos (`peso_pct`) vêm da Camada 4 e não são recalculados.
- ✅ Policy `service_role_bypass` é `TO service_role` (não repete o bug de `assisted_assembly`).

## Próximo passo

PARTE 2 — UI de edição do estúdio (escolher variação por adset, editar, marcar `escolhida=true`, finalizar). Não construída nesta tarefa.
