---
name: MP Audience — Validação de Mensagem dos Criativos (Camada 2)
description: Edge function crm-validate-creative-messages + tabela crm.creative_message_validation. Compara copy do criativo com os gatilhos activos do evento (Camada 1) e emite semáforo coerente/atenção/contradiz. LLM nunca afirma factos comerciais.
type: feature
---

# Validação de Mensagem dos Criativos

Camada 2 da feature "Montagem Assistida". Lê **apenas** os gatilhos da Camada 1 (`crm.event_active_triggers` + catálogo) e valida a copy de cada criativo contra eles. Não toca em diagnóstico nem em redesign.

## Princípio inviolável (P0)
O LLM **nunca** decide nem afirma um facto comercial. Os factos vêm dos gatilhos activos declarados manualmente pelo Pedro (Camada 1). O LLM apenas LÊ a copy, COMPARA com os gatilhos, e escreve um veredicto em linguagem.

## Tabela `crm.creative_message_validation`

Colunas relevantes:
- `id`, `company_id`, `event_id`, `creative_id` (FK→`crm.meta_creatives` ON DELETE CASCADE)
- `semaforo` (`coerente|atencao|contradiz`)
- `aproveita_gatilhos boolean` — true quando a copy usa pelo menos um gatilho activo disponível
- `explicacao text`, `sugestao_copy text` (gerados pelo LLM, PT)
- `gatilhos_snapshot jsonb` — snapshot dos gatilhos disponíveis + expirados no momento da validação
- `analysis_model text` (`google/gemini-2.5-flash`)
- `validated_by`, `validated_at`
- `UNIQUE (creative_id, event_id)` — revalidar = upsert que substitui

Índices em `event_id`, `company_id`, `creative_id`.

RLS padrão crm (`current_company_id()`): `service_role_bypass` + `tenant_isolation_{select,insert,update,delete}`. Permite escrita por edge function service_role e por cliente authenticated.

## ⚠️ DDL em Live

O Publish **não propaga DDL** neste projecto (problema conhecido). A tabela existe em Test via migration `20260621*_creative_message_validation`; o Pedro tem de aplicar o mesmo DDL em Live manualmente via SQL Editor.

## Edge Function `crm-validate-creative-messages`

Marcador (1ª linha do handler): `console.log("[validate-messages] BUILD_VERSION=validate-messages-v1")`.

**Input** (POST):
```json
{ "company_id": "uuid", "event_id": "uuid", "creative_ids": ["uuid", ...] }
```
Agnóstica à origem dos criativos — serve a campanha aberta, candidatos do redesenho ou criativos novos.

**Lógica determinística**:
1. Valida pertença ao company (lê evento via RLS do utilizador).
2. Lê `crm.event_active_triggers` join `strategic_trigger_catalog` para o evento.
3. **Selecção de gatilhos é 100% determinística**:
   - **Disponíveis** = `estado='activo'` AND (`validade IS NULL` OR `validade >= hoje`)
   - **Expirados** = `estado='expirado'` OR `validade < hoje` (contam como NÃO disponíveis; contradizem alegações associadas)
4. Para cada criativo, chama Gemini via Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`, modelo `google/gemini-2.5-flash`, temperature 0.1, mesmo padrão de `crm-meta-creative-analyze`).
5. Upsert em `crm.creative_message_validation` onConflict `(creative_id, event_id)`.

**Output do LLM (JSON estrito)** por criativo:
```json
{
  "semaforo": "coerente|atencao|contradiz",
  "aproveita_gatilhos": true|false,
  "explicacao": "1-2 frases PT",
  "sugestao_copy": "reformulação OU null"
}
```

## Semântica do semáforo

- **🔴 contradiz** — copy faz uma alegação (urgência, escassez, prazo, virada de lote, etc.) que NENHUM gatilho disponível respalda, OU que um gatilho expirado contradiz.
- **🟡 atenção** — coerência parcial/ambígua.
- **🟢 coerente** — copy não contradiz nada. Subdivide-se via `aproveita_gatilhos`:
  - `true` → usa pelo menos um gatilho activo disponível.
  - `false` → copy genérica ("Garante o teu bilhete"); na UI marca-se com badge âmbar discreta de **"Oportunidade"** (distinta do amarelo de atenção). A `explicacao` deve assinalar a oportunidade perdida.

## Regra da `sugestao_copy`

Só pode propor reformulações apoiadas em gatilhos **activos e disponíveis**. NUNCA introduz alegações novas sem gatilho a respaldá-las (não troca uma alegação não-respaldada por outra inventada). Se nada a sugerir → `null`. Marcada na UI como "Sugestão (editável, não aplicada)".

## Determinismo de enquadramento

A SELECÇÃO de gatilhos (quais estão activos/disponíveis vs expirados) é 100% determinística no código. O LLM só trata a LINGUAGEM. Re-runs com a mesma copy e os mesmos gatilhos dão o mesmo semáforo (variando apenas o texto livre da explicação/sugestão).

## UI (CampaignView)

- Card "Anúncios" ganha botão **"Validar mensagens"** no header.
  - Desactivado quando `linked_event_id` é null (tooltip: "associe um evento para validar mensagens").
  - Loading spinner durante a chamada.
- Cada ad ganha badge de semáforo (🟢/🟡/🔴) + ícone Lucide. Coerentes sem `aproveita_gatilhos` recebem badge âmbar **"Oportunidade"** adicional.
- Tooltip ao hover mostra `explicacao`, `sugestao_copy` (marcada como sugestão editável) e timestamp `validated_at`.
- Criativos ainda não validados → badge neutro "Mensagem por validar".

## Não-objectivos desta camada

- Integração no fluxo de redesenho/criação fica para passo seguinte (a função já é agnóstica à origem dos criativos).
- Sem alterações ao diagnóstico (`crm-campaign-diagnosis`) nem ao redesign.
