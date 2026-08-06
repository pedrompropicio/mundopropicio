---
name: BP Planilha v2 — spike Handsontable
description: Spike de avaliação da planilha do BP com Handsontable + HyperFormula, em paralelo à Planilha Univer (não substitui, não vai a produção sem licença comercial).
type: feature
---

## Objetivo
Avaliar o Handsontable como superfície de edição em massa do BP, **lado a lado** com a
Planilha atual (Univer, `src/pages/admin/BPUniverSpike.tsx`). O Univer **não foi tocado**.

## Onde vive
- Componente: `src/pages/admin/BPPlanilhaV2.tsx`
- Entrada: aba **Previsões** do BP → botão **"Planilha v2 (beta)"** (`forecastsViewMode === "sheet2"`),
  visível **só para admin** e só em desktop. Lazy-loaded.
- Deps: `handsontable`, `@handsontable/react-wrapper`, `hyperformula`.

## Licença (bloqueio de produção)
`licenseKey: "non-commercial-and-evaluation"` — válido apenas para avaliação.
Não promover a vista padrão nem remover o gate de admin antes de decidir a compra
da licença comercial do Handsontable.

## Contrato funcional (replicado do Univer, não reinventado)
- Carrega `event_forecasts` com `version_id IS NULL`, `status IN ('approved','draft')`, `type='expense'`.
- Grelha hierárquica L1 > L2 > L3 (linhas de grupo read-only) + linhas de despesa editáveis.
- Colunas: Categoria (read-only) · Descrição · Especificação · Valor s/IVA · Taxa IVA (dropdown
  com as taxas do país do evento via `useEventIvaCountry`) · Total c/IVA (**fórmula HyperFormula**
  `=D{n}*(1+E{n}/100)`, read-only) · Formalidade (dropdown com os 5 estados).
- Edição em memória → **Gravar** com diálogo de confirmação (N editadas / inseridas / removidas).
- Gravação por diff: `batch_update_event_forecasts` (valida `updated === edits.length`),
  `batch_insert_event_forecasts` (novas entram como rascunho) e `DELETE` para removidas.
- Input PT: `parseAmountPT` aceita `1.064,42 €` → `1064.42` (também no paste, via `beforeChange`).
- Poda de no-ops: o diff só inclui campos realmente diferentes do original → contador sem falsos positivos.
- Nativo aproveitado: undo/redo (Ctrl+Z recalcula o contador via `afterUndo`), colar do Excel,
  fill handle, navegação por teclado.

## Formatação, ecrã inteiro e refresh
- Colunas Valor s/IVA e Total c/IVA renderizadas com `formatCurrencyDecimal` (PT-PT, "61.800,00 €"),
  negativos em `hsl(var(--destructive))`; Taxa IVA com sufixo "%". Formatação é **só visual** —
  o valor subjacente continua numérico e a edição com vírgula PT mantém-se.
- Botão "Ecrã inteiro" (overlay `fixed inset-0 z-[9999]`) com barra de ações replicada,
  `<style>` a elevar dropdowns do Handsontable/Radix/Sonner, saída por botão ou Esc.
- Após GRAVAR invalida `event_forecasts`, `forecasts`, `bp`, `partner-bp-realized`,
  `scenario-forecasts`, `adopted_forecasts`, `parent_event_forecasts`, `efc-forecasts`, `efc-tx`
  → vista Agrupada e cards do evento refrescam sem F5.

## Limitações conhecidas do spike
- Inserir/apagar linha reconstrói a grelha (limpa o histórico de undo dessas operações;
  edições de valor mantêm undo normal).
- Só despesas; receitas continuam na vista Agrupada/Univer.
