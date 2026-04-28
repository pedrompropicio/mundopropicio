---
name: Overhead allocations
description: Rateios de overhead em event_forecasts (is_overhead=true) com proração virtual Master→Splits (÷N igualitário); aparecem em BP/DRE com badge "Overhead" (admin/manager) e "via Master" nos splits; exclude_from_result=true (não impactam empresa); somam ao acerto de sócios proporcionalmente em cada split; toggles "Com/Sem Overhead" em Previsão vs Real, DRE, DRE Brasil e Análise de Resultados; nos relatórios DRE (Standard, Brasil e export) os overheads são alocados DENTRO da categoria contabilística respetiva (em vez de bloco separado), com lista de "Detalhe de Overheads (já incluídos nas categorias acima)" só para rastreabilidade
type: feature
---

## Conceito
Linhas de overhead (assessoria de imprensa, jurídico, equipa de escritório) são lançadas como qualquer linha de BP em `event_forecasts` com:
- `is_overhead = true`
- `exclude_from_result = true` (não compõem resultado da empresa — já foram pagas noutros momentos)
- `status = 'approved'`
- **NÃO geram transação de liquidação**

A flag substitui a antiga tabela `event_closing_costs` (deprecated, retida 2 semanas).

## Vínculo opcional a previsão do BP de Overhead
- No formulário do separador Overhead (`EventClosingCosts`), seletor opcional **"Vincular a linha do BP de Overhead"** lista previsões `is_overhead=true` do próprio evento + Master (filtradas pelo tipo). O vínculo persiste em `master_forecast_id`.
- Quando vazio: badge **"Sem previsão no BP"** (warning) na linha + aviso inline no formulário. Quando preenchido: badge **"BP: <categoria> · <descrição>"** (primary).
- Permite registar overheads sem planeamento prévio mantendo a vinculação ao BP de Overhead quando esta existe.

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
4. **`ResultsAnalysis`**: Planeado/Real do split inclui a fatia (gateado pelo toggle local)
5. **`EventForecast` (BP do Split)**: query separada `bp_overhead_via_master` busca overheads do Master e adiciona fatia virtual ao array `forecasts`. Renderiza com `readOnly=true` e badge `via Master` (primary, sempre visível). Não permite editar/eliminar.

### Critério de proração
- Default: **igual entre splits** (÷N). Custos não-volumétricos como assessoria/jurídico não escalam com receita; partilha equitativa é o critério mais previsível.

## Toggles "Com / Sem Overhead" nos relatórios (decisão 2026-04)
Para resolver a ambiguidade entre "Vista Empresa" (overhead fora, coerente com DRE) e "Vista Sócio" (overhead dentro, coerente com Acerto), todos os relatórios relevantes têm um seletor com 2 opções:

| Relatório | Componente | Default | Mecanismo |
|---|---|---|---|
| **Previsão vs Real** (BP do evento) | `EventForecast.tsx` → `includeOverheadInComparison` | OFF (Sem overhead) | Quando ON, `comparisonForecasts` inclui linhas `is_overhead=true` do próprio evento + fatia `_overhead_via_master` no split. Coluna Real fica €0 nessas linhas (overhead não gera TX) — útil para auditar planeamento |
| **DRE** | `ReportDRE.tsx` → `showPartnerView` | OFF (Vista Empresa) | Switch "Vista Sócio (com Overhead)" — gate em `closingCosts`. Overheads aplicam IVA linha-a-linha (default 23% se sem `iva_rate`); base do sócio com `expense_includes_iva` deduz overheads c/IVA. Resultado Líquido (s/IVA) deduz só base. |
| **DRE Brasil** | `ReportDREBrasil.tsx` → `showPartnerView` | OFF (Vista Empresa) | Idem DRE; modo Brasil sempre c/IVA |
| **Análise de Resultados** | `ResultsAnalysis.tsx` → `includeOverhead` | OFF (Vista Empresa) | Quando ON, `closingMap` é populado e soma ao `bpExpense` / `realExpense` de Planeado 100% / 80% / Real Atual |
| **Acerto com Sócios** | `ReportPartnerSettlement.tsx` | sempre ON | Por natureza é sempre vista do sócio |
| **BP x Transações (Despesas)** | `ReportBPTransactions.tsx` | OFF (Sem overhead) | Seletor local inclui/exclui linhas `event_forecasts.is_overhead=true`; quando ON, o Previsto passa a somar overhead do evento e também a fatia virtual via Master no split |
| **DRE Empresarial** | `ReportDREEmpresarial.tsx` | **NÃO inclui overhead** (decisão 2026-04) | Overhead é previsão de gestão a nível de evento; não entra no DRE consolidado mensal da empresa, que trabalha em valores líquidos sobre transações reais |

**Justificação**: o overhead é por design "informativo" para a empresa (já foi pago noutros momentos) e "computado" para o sócio (reduz o resultado dele). O toggle deixa o utilizador escolher a perspetiva sem misturar.

### Conflito com BP existente (mesma categoria)
- Política: **somar** — overhead acresce ao BP da categoria. Não substitui, não consome saldo.
- Ex.: BP "Jurídico €2.000" + overhead "Jurídico €500" → categoria totaliza €2.500 no DRE/Real.
- O formulário em `EventClosingCosts` mostra **aviso (warning, não bloqueio)** quando a categoria escolhida já tem linhas no BP do próprio evento e/ou no BP do Master da turnê (query `bp-categories-for-overhead-check`). Utilizador confirma e prossegue.

### Anexos
Bucket `closing-cost-documents` reutilizado (mantém anexos antigos pré-migração).

## IVA do Overhead em Gross
Overhead tem `iva_rate` próprio (pode ser 0 ou 23). No Gross deve sempre passar por `calcTotalWithIva(amount, iva_rate)`. Bug 2026-04: `PartnerSettlementTab` somava overhead em Gross sem IVA, deflacionando despesas em ~IVA% (ex.: Mágicos 2.6.07 Taxa Ticketline 2% → faltava 425,32 €). Corrigido em `totalExpensesGross`, `cityBreakdown` (local + masterShare) e `expenseByCategory.amountGross`.
