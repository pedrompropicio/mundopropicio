---
name: Overhead allocations
description: Rateios de overhead em event_forecasts (is_overhead=true) com proração virtual Master→Splits (÷N igualitário); aparecem em BP/DRE com badge "Overhead" (admin/manager) e "via Master" nos splits; exclude_from_result=true (não impactam empresa); somam ao acerto de sócios proporcionalmente em cada split
type: feature
---

## Conceito
Linhas de overhead (assessoria de imprensa, jurídico, equipa de escritório) são lançadas como qualquer linha de BP em `event_forecasts` com:
- `is_overhead = true`
- `exclude_from_result = true` (não compõem resultado da empresa — já foram pagas noutros momentos)
- `status = 'approved'`
- **NÃO geram transação de liquidação**

A flag substitui a antiga tabela `event_closing_costs` (deprecated, retida 2 semanas).

## Marcação no BP
- Checkbox **"Overhead"** no formulário inline e no `ForecastEditModal`, visível só para admin/manager
- Badge `Overhead` (warning) nas linhas, visível só para admin/manager — sócio vê linha como despesa normal

## Proração Master→Splits (virtual, ÷N igualitário)
Helper `expandOverheadToSplits(overheads, events)` em `src/lib/overhead-proration.ts`:
- Linha lançada no Master é mantida intacta (informativa para reporting consolidado)
- Para cada split do Master, gera fatia virtual com `event_id` reescrito, `amount = total / N`, flag `_overhead_via_master = true`, `_master_event_id`, `_split_share = 1/N`
- ID virtual: `${originalId}::split::${splitId}` (não persiste no DB)
- Eventos sem splits: linha fica intacta no próprio evento

### Onde se aplica a expansão
1. **`ReportPartnerSettlement`**: cada sócio de cada cidade absorve a fatia que lhe cabe (essencial — sócios podem ser diferentes por cidade)
2. **`ReportDRE`** (vista sócio com `showPartnerView`): split mostra fatia, Master continua a mostrar total
3. **`ReportDREBrasil` / `ReportDREEmpresarial`**: idem
4. **`ResultsAnalysis`**: Planeado/Real do split inclui a fatia
5. **`EventForecast` (BP do Split)**: query separada `bp_overhead_via_master` busca overheads do Master e adiciona fatia virtual ao array `forecasts`. Renderiza com `readOnly=true` e badge `via Master` (primary, sempre visível). Não permite editar/eliminar.

### Critério de proração
- Default: **igual entre splits** (÷N). Custos não-volumétricos como assessoria/jurídico não escalam com receita; partilha equitativa é o critério mais previsível.

### Conflito com BP existente (mesma categoria)
- Política: **somar** — overhead acresce ao BP da categoria. Não substitui, não consome saldo.
- Ex.: BP "Jurídico €2.000" + overhead "Jurídico €500" → categoria totaliza €2.500 no DRE/Real.
- O formulário em `EventClosingCosts` mostra **aviso (warning, não bloqueio)** quando a categoria escolhida já tem linhas no BP do próprio evento e/ou no BP do Master da turnê (query `bp-categories-for-overhead-check`). Utilizador confirma e prossegue.

### Anexos
Bucket `closing-cost-documents` reutilizado (mantém anexos antigos pré-migração).
