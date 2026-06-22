---
name: MP Audience — Elo de Publicação no Meta (FASES 1+2)
description: FASE 1 (preparação/revisão) com crm-meta-publish-prepare + crm.meta_publish_plan + MetaPublishPanel. FASE 2 (escrita real) com crm-meta-publish-execute (ABO, tudo PAUSED, idempotente, dry-run). Botão "Publicar no Meta (em pausa)" agora activo com confirmação em 2 passos.
type: feature
---

# Elo de Publicação no Meta — FASE 1 (Preparação)

Liga o estúdio (Camada 5) a um plano de publicação revisto pelo gestor. **Não escreve nada no Meta.**

## ⚠️ Limite absoluto desta fase

- Esta fase **não** chama a Graph API de escrita.
- Esta fase **não** instala nem usa SDK de escrita do Meta.
- O botão final "Publicar no Meta (em pausa)" está **desactivado** com tooltip "Escrita no Meta — Fase 2 (ainda não disponível)".
- Tudo o que faz: lê dados existentes, LLM sugere público, gestor revê, guarda em rascunho na nossa BD.

## Tabela `crm.meta_publish_plan`

- `id`, `company_id`, `event_id`, `design_id` (FK conceptual a `crm.campaign_design.id`, sem REFERENCES)
- `objetivo text NULL` — objetivo de campanha Meta (`OUTCOME_SALES|OUTCOME_TRAFFIC|OUTCOME_AWARENESS|OUTCOME_ENGAGEMENT`)
- `orcamento_total_cents bigint NULL`, `moeda text NOT NULL DEFAULT 'EUR'`
- `adsets jsonb NOT NULL` — estrutura abaixo
- `estado text` CHECK in (`'rascunho','pronto_a_publicar','publicado','falhado'`) default `'rascunho'`
- `resumo jsonb NULL`, `created_by uuid?`, `created_at`, `updated_at` (trigger)
- Índices: `(event_id)`, `(company_id)`, `(design_id)`

RLS padrão crm: `service_role_bypass FOR ALL TO service_role` (não TO public) + `tenant_isolation_*` com `company_id = current_company_id()`.

### Estrutura de cada elemento de `adsets`

```json
{
  "trigger_id": "uuid|null",
  "trigger_nome": "Mudança de lote",
  "trigger_tipo": "escassez|...",
  "peso_pct": 70,
  "orcamento_cents": 0,
  "publico_sugerido": {
    "resumo": "PT-PT", "idade_min": 25, "idade_max": 55,
    "geo": ["PT"], "interesses": ["..."],
    "baseado_em": "padrões reais da amostra que informaram"
  },
  "publico_custom_audience_id": null,
  "anuncios": [
    { "creative_ids": ["uuid"], "headline": "...", "corpo": "...", "cta": "SHOP_NOW", "origem_variacao_idx": 0 }
  ]
}
```

## ⚠️ DDL em Live

Publish não propaga DDL. A tabela existe em Test via migration `20260621*_meta_publish_plan`; o Pedro tem de aplicar o mesmo DDL em Live à mão.

## Edge Function `crm-meta-publish-prepare`

Marcador: `console.log("[meta-publish-prepare] BUILD_VERSION=publish-prepare-v1")`.
Input: `{ company_id, design_id, orcamento_total_cents?, objetivo? }`.

Lógica determinística (NÃO escreve no Meta):

1. Valida pertença ao company (lê design via service_role + valida evento via RLS user).
2. Lê `crm.campaign_design` por `design_id`.
3. **FILTRO P0 CRÍTICO:** só variações com `semaforo='coerente'` viram `anuncios`. `atencao`, `contradiz` e `por_revalidar` são EXCLUÍDAS. Se um adset fica com 0, marca-o como "sem anúncios elegíveis" mas mantém-no no plano.
4. **Sugestão de público (LLM):** lê amostra dos 60 adsets mais recentes de `crm.meta_adset_snapshot` (where `company_id=X AND targeting IS NOT NULL ORDER BY updated_at DESC LIMIT 60`), resume os targetings (idade, geo, interesses), passa ao Gemini 2.5 Flash via Lovable AI Gateway (`temperature=0.3`, retry 429, trata 402). LLM devolve `{resumo, idade_min, idade_max, geo[], interesses[], baseado_em}`. **O LLM nunca decide orçamento.**
5. **Repartição de orçamento:** se `orcamento_total_cents` vier, reparte pelos pesos (70/30 → 70%/30%), arredonda aos cents, diferença ao maior peso. Determinístico em código. Sem total → 0 em cada adset.
6. Persiste em `crm.meta_publish_plan` (insert novo, estado='rascunho').

Resposta: `{ plan_id, design_id, adsets, totais: { adsets, anuncios_elegiveis, variacoes_excluidas } }`.

## UI — `MetaPublishPanel`

`src/components/crm/MetaPublishPanel.tsx`. Sheet a tela cheia. Props: `{ open, onOpenChange, companyId, designId }`.

- Ao abrir: invoca `crm-meta-publish-prepare` sem orçamento; recebe o plano.
- Topo: select de **objetivo** + input de **orçamento total €**. Mudar o total reparte automaticamente pelos adsets (no cliente, espelhando a fórmula do servidor) — mas só adsets **não ajustados à mão**. Adsets que o gestor editou ficam fixos e marcados "ajustado à mão".
- Por adset: cabeçalho + badge tipo + `peso_pct`; orçamento editável; **público sugerido** editável (`idade_min/max`, `geo`, `interesses`) com nota "Sugerido a partir de: ..." e input opcional de `custom audience id`; lista de **anúncios** (só 🟢) com nota "Só variações coerentes são publicadas" e contagem de excluídas se aplicável.
- Auto-save (debounce 800ms): `UPDATE crm.meta_publish_plan` com `objetivo`, `orcamento_total_cents`, `adsets[]`. Indicador "A guardar / Guardado".
- Resumo final (rodapé fixo): "Vais criar 1 campanha em PAUSA · N adsets · M anúncios · orçamento total X € · objetivo Y". Avisa se a soma dos adsets não bate com o total.
- **Botão "Publicar no Meta (em pausa)": DESACTIVADO**, tooltip "Escrita no Meta — Fase 2 (ainda não disponível)". Não faz nada — só sinaliza que existe.

## Ponto de entrada

`src/pages/crm/CampaignView.tsx` — no card "Estúdio de Desenho de Campanha" foi adicionado um segundo botão **"Preparar publicação"** que abre o `MetaPublishPanel` com o `design_id` mais recente do evento (`crm.campaign_design where event_id=... order by generated_at desc limit 1`). Desactivado com tooltip se não houver design.

## Garantias

- ✅ **Zero chamadas de escrita ao Meta** no código desta fase.
- ✅ Só variações **coerentes** entram nos `anuncios` (filtro P0 no servidor).
- ✅ Repartição de orçamento é **determinística** em código pelos pesos da Camada 4. LLM nunca toca em orçamento.
- ✅ Pesos `peso_pct` vêm do desenho (Camada 5) → da montagem (Camada 4). A UI não os recalcula.
- ✅ Botão de publicar está **desactivado** à espera da FASE 2.

## Próxima fase (não nesta)

FASE 2: criar campanha em PAUSA + adsets + anúncios no Meta via Graph API, ler o plano persistido. FASE 3: medições. Esta memória só descreve a FASE 1.
