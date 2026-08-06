---
name: BP Planilha (Handsontable) — vista oficial
description: Vista "Planilha" do BP com Handsontable + HyperFormula; oficial desde 06/08/2026, substituiu o Univer (aposentado). Inclui contrato funcional, formatação PT-PT, ecrã inteiro e pendência de licença.
type: feature
---

## Estado
**Vista oficial da Planilha do BP desde 06/08/2026.** O Univer foi **aposentado**
(`src/pages/admin/BPUniverSpike.tsx` apagado, pacotes `@univerjs/*` desinstalados).
Motivo: lib 0.25 instável, exigia ~2.759 linhas de workarounds e ~10MB de bundle.

## Onde vive
- Componente: `src/pages/admin/BPPlanilha.tsx`
- Entrada: aba **Previsões** do BP → botão **"Planilha"** (`forecastsViewMode === "sheet"`),
  desktop-only, lazy-loaded. Sem gate de admin: quem pode editar o BP (`canEditBP`) usa a Planilha
  (mesma regra que a antiga Planilha Univer tinha).
- Deps: `handsontable`, `@handsontable/react-wrapper`, `hyperformula`.

## ⚠️ Licença (pendência)
`licenseKey: "non-commercial-and-evaluation"` mantém-se por agora. Há um TODO destacado no topo
do componente: **em produção comercial é obrigatória licença Handsontable comprada**.

## Contrato funcional
- Carrega `event_forecasts` com `version_id IS NULL`, `status IN ('approved','draft')`, `type='expense'`.
- Grelha hierárquica L1 > L2 > L3 (linhas de grupo read-only, indentadas por nível) + linhas editáveis.
- Colunas: Categoria (read-only) · Descrição · Especificação · Valor s/IVA · Taxa IVA (dropdown
  com as taxas do país do evento via `useEventIvaCountry`) · Total c/IVA (fórmula HyperFormula
  `=D{n}*(1+E{n}/100)`, read-only) · Formalidade (dropdown com os 5 estados).
- Edição em memória → **Gravar** com diálogo de confirmação (N editadas / inseridas / removidas).
- Gravação por diff: `batch_update_event_forecasts` (valida `updated === edits.length`),
  `batch_insert_event_forecasts` (novas entram como rascunho) e `DELETE` para removidas.
- Input PT: `parseAmountPT` aceita `1.064,42 €` → `1064.42` (também no paste, via `beforeChange`).
- Poda de no-ops: o diff só inclui campos realmente diferentes do original.
- Nativo aproveitado: undo/redo (`afterUndo` recalcula o contador), colar do Excel, fill handle, teclado.
- Inserir/apagar linha: usa a última seleção (`afterSelectionEnd` + `outsideClickDeselects: false`),
  herda categoria, nunca falha em silêncio (toast), e não apaga headers de grupo.

## Formatação, tema, ecrã inteiro e refresh
- Valor s/IVA e Total c/IVA com `formatCurrencyDecimal` (PT-PT, "61.800,00 €"), negativos em
  `hsl(var(--destructive))`; Taxa IVA com sufixo "%". Formatação só visual — valor subjacente numérico.
- Tema segue o tema ATIVO do app (`ThemeContext`): `ht-theme-main` / `ht-theme-main-dark` (nunca `-auto`).
- Botão "Ecrã inteiro" (overlay `fixed inset-0 z-[9999]`), saída por botão ou Esc.
- Após GRAVAR invalida `event_forecasts`, `forecasts`, `bp`, `partner-bp-realized`,
  `scenario-forecasts`, `adopted_forecasts`, `parent_event_forecasts`, `efc-forecasts`, `efc-tx`.

## Limitações conhecidas
- Inserir/apagar linha reconstrói a grelha (limpa o undo dessas operações).
- Só despesas; receitas continuam na vista Agrupada.
