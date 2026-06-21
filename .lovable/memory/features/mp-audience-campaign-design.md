---
name: MP Audience — Estúdio de Desenho de Campanha (Camada 5)
description: Motor (PARTE 1) crm.campaign_design + crm-campaign-design-generate e UI (PARTE 2) CampaignDesignStudio + crm-validate-design-text. Cada variação nasce com semáforo; edições à mão são re-validadas por servidor. Pesos vêm da Camada 4 e não são tocados.
type: feature
---

# Estúdio de Desenho de Campanha — Camada 5

Veste a montagem da Camada 4 com **textos** e **escolha de imagem** por adset.

## Princípio inviolável (P0)

- Cada variação de texto **nasce** auto-classificada (semáforo + `aproveita_gatilhos` + `explicacao_validacao`) segundo a MESMA lógica da Camada 2.
- Quando o gestor **edita** uma variação à mão, o semáforo passa a `por_revalidar` (estado neutro/cinza) e SÓ pode voltar a coerente/atenção/contradiz através da edge function `crm-validate-design-text`. **Nunca é decidido no cliente.**
- **Regra dura de urgência temporal:** "hoje/agora/últimas horas/termina já/acaba hoje" só permitido se houver gatilho activo de `calendario` OU `contagem_regressiva` dentro de validade. Escassez (ex.: virada de lote) autoriza falar de subida de preço, **não** de horas. Aplica em geração E re-validação.
- Os pesos `peso_pct` vêm da Camada 4 e **não são recalculados pela UI**.

## PARTE 1 — Motor

### Tabela `crm.campaign_design`

- `id`, `company_id`, `event_id`, `assembly_id` (FK conceptual a `crm.assisted_assembly.id`, sem REFERENCES)
- `adsets jsonb NOT NULL` — array
- `estado text` CHECK in (`'rascunho'`, `'finalizado'`) default `'rascunho'`
- `generated_by uuid?`, `generated_at`, `updated_at` (trigger)
- Índices: `(event_id)`, `(company_id)`, `(assembly_id)`. **Sem unique** — histórico.

RLS padrão crm: `service_role_bypass FOR ALL TO service_role` + `tenant_isolation_*` com `company_id = current_company_id()`.

#### Estrutura de cada elemento de `adsets`
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
      "semaforo": "coerente|atencao|contradiz|por_revalidar",
      "aproveita_gatilhos": true,
      "explicacao_validacao": "porque deu este semáforo",
      "escolhida": false
    }
  ]
}
```

> `por_revalidar` é um estado **UI-only** que aparece em `semaforo` enquanto o gestor não chama `crm-validate-design-text`. Persiste no jsonb tal como qualquer outro valor.

### Edge Function `crm-campaign-design-generate`

Marcador: `console.log("[campaign-design] BUILD_VERSION=design-generate-v1")`.

Input: `{ company_id, assembly_id }`. Lê assembly (Camada 4) + gatilhos disponíveis/expirados (lógica determinística igual à Camada 2) + criativos. Para cada adset chama Gemini 2.5 Flash via Lovable AI Gateway (`temperature=0.4`, retry 429, trata 402) que devolve `pecas[].motivo_escolha` + 2–3 `variacoes_texto[]` já auto-classificadas. Persiste linha nova (`estado='rascunho'`).
Resposta: `{ design_id, assembly_id, adsets, contagem: { adsets, variacoes_total } }`.

## PARTE 2 — UI + re-validação

### Edge Function `crm-validate-design-text`

Marcador: `console.log("[validate-design-text] BUILD_VERSION=validate-design-text-v1")`.

Input: `{ company_id, assembly_id, headline, corpo, cta }`.
Lógica:
1. Valida pertença ao company (lê event_id da assembly via service_role + valida via RLS do user — igual ao motor).
2. Lê gatilhos do evento com selecção determinística em código: `disponíveis` (`estado='activo'` AND validade ≥ hoje OR NULL) + `expirados` (`estado='expirado'` OR validade < hoje). Calcula `hasTime` (existe disponível tipo `calendario` ou `contagem_regressiva`).
3. Gemini 2.5 Flash via Lovable AI Gateway, **`temperature=0.1`** (baixa — é validação, não geração), retry 429, trata 402. Prompt aplica as MESMAS regras duras da geração.
4. **Não persiste.** Devolve `{ semaforo, aproveita_gatilhos, explicacao }`.

A persistência do texto editado (e do semáforo devolvido) é feita pela UI ao gravar o rascunho.

### Componente `CampaignDesignStudio`

`src/components/crm/CampaignDesignStudio.tsx`. Sheet a tela cheia. Props: `{ open, onOpenChange, companyId, assemblyId }`.

Comportamento:
- Ao abrir: lê `crm.campaign_design` mais recente para a assembly (`order by generated_at desc limit 1`). Se não existir, mostra botão "Gerar desenho" que invoca `crm-campaign-design-generate`.
- Por adset renderiza: cabeçalho com `trigger_nome` + badge do tipo (cor) + `peso_pct` ("investimento sugerido"). Peças com miniatura (se imagem) + `motivo_escolha`. Variações **lado a lado** (grid) com `SemaforoBadge` + `explicacao_validacao` em tooltip + botão "Escolher esta".
- A variação `escolhida=true` torna-se editável: `headline` (Input), `corpo` (Textarea), `cta` (Select com CTAs Meta). Ao editar, o semáforo passa a `por_revalidar` e aparece botão **"Validar"** que invoca `crm-validate-design-text`.
- "Re-pedir ao LLM" (nível campanha) re-invoca `crm-campaign-design-generate` (regenera tudo — aviso implícito).
- **Auto-save:** debounce 800ms, `UPDATE` em `crm.campaign_design` com o `adsets[]` actualizado. Indicador "A guardar… / Guardado".
- **Finalizar:** `UPDATE estado='finalizado'`. Apenas marcador interno — **não publica** em lado nenhum (não há integração de saída).

### Ponto de entrada na CampaignView

`src/pages/crm/CampaignView.tsx` — card "Estúdio de Desenho de Campanha" logo após o card de Montagem Assistida. Wrapper `DesignStudioEntry` resolve o `assemblyId` mais recente do evento (`crm.assisted_assembly where event_id=... order by generated_at desc limit 1`). Botão "Desenhar campanha" fica desactivado com tooltip "Cria primeiro uma montagem assistida" se não houver nenhuma.

## ⚠️ DDL em Live

Publish **não propaga DDL**. A tabela `crm.campaign_design` existe em Test via migration `20260621*_campaign_design`; o Pedro tem de aplicar o mesmo DDL em Live à mão. A edge function `crm-validate-design-text` deploya por Publish (não tem DDL).

## Garantias

- ✅ Semáforo de texto editado vem **sempre** de `crm-validate-design-text` (servidor). Cliente nunca decide.
- ✅ Regra de urgência temporal (calendário/contagem) está nos prompts da geração e da validação.
- ✅ Pesos `peso_pct` vêm exclusivamente da Camada 4 — a UI nunca os toca.
- ✅ Auto-save preserva escolhas e re-validações entre sessões.
