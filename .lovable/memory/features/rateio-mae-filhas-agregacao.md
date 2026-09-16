---
name: Rateio multi-evento — mãe vs filhas nas agregações
description: Agregação de empresa conta a MÃE do rateio e exclui as FILHAS; agregação de evento conta as filhas. Predicado único em src/lib/rateio-children.ts (D-ERP70).
type: feature
---

# Rateio multi-evento: quem conta em que agregação

## O modelo

O rateio multi-evento (`TransactionSplitConfig`) cria:

- uma transação-**MÃE** — `event_id` NULL, tem `account_id`, é ela que move o saldo da conta;
- N transações-**FILHAS** — `event_id` preenchido, `account_id` NULL,
  `parent_transaction_id` a apontar para a mãe.

A mãe é a **fatura inteira**. As filhas são a **decomposição dela por evento**.

## O defeito (medido em Live, 16/09/2026)

59 mães somam **199.971,29 €**; 157 filhas somam **198.796,70 €** — todas de 2026.

Nenhum código do sistema filtrava `parent_transaction_id`. A protecção era sempre **acidental**:
ou o relatório filtrava por `event_id` (e a mãe, sem evento, caía fora), ou filtrava por conta
(e as filhas, sem conta, caíam fora). Onde não havia nem uma nem outra, mãe **e** filhas somavam
as duas e a despesa aparecia **ao dobro**.

## A regra (uma só) — D-ERP70

- Agregação ao nível da **EMPRESA** → conta a **mãe**, exclui as **filhas**.
- Agregação ao nível do **EVENTO** → conta as **filhas**; a mãe cai fora sozinha porque a query
  filtra por `event_id`. **Não se mexe** nesses sítios.

## Predicado — vive UMA vez

`src/lib/rateio-children.ts`:

```ts
isRateioChild(t)         // t.parent_transaction_id != null && t.installment_group_id == null
excludeRateioChildren(rows)
RATEIO_FILTER_COLUMNS    // "parent_transaction_id, installment_group_id"
```

Nunca escrever a condição à mão num componente. Se viver em oito sítios, volta a divergir.

### Porque é que `installment_group_id` faz parte do predicado

Distingue filha de rateio de **parcela de pagamento**. Nas parcelas a "mãe" é a **1.ª prestação**
e **não** carrega o total: medido em Live (11 grupos, 12 parcelas), mãe + parcelas = total da
obrigação. Logo somam-se todas — excluir parcelas apagaria dinheiro verdadeiro. As parcelas
**não** têm o defeito da duplicação.

## Onde se aplica (os oito sítios corrigidos a 16/09/2026)

| Sítio | Nota |
| --- | --- |
| `ReportCashFlow` | modo "Todas as contas" (default). Aplicado à agregação toda: no detalhe "por evento" o rateio aparece na linha "Sem evento" (a mãe), o que mantém o total do detalhe igual ao consolidado |
| `ReportTreasuryProjection` | impacto de pendentes/aprovados no saldo |
| `ReportMonthlyEvolution` | receita/despesa/margem por mês |
| `ReportAging` | dívida em aberto por antiguidade |
| `ReportContasPagar` | só quando **não** há filtro por evento ("Todos os eventos", default); com eventos escolhidos passa a ser agregação de evento e contam as filhas |
| `ReportSupplierConcentration` | Pareto de fornecedores |
| `DashboardCharts` → "Despesas por Categoria" | agregação de empresa |
| `DashboardCharts` → "Evolução Acumulada" | agregação de empresa. O gráfico "Margem por Evento" do mesmo ficheiro **fica intacto** — é agregação de evento |

Nota: `DashboardCharts` não está montado em nenhuma página a 16/09/2026 (componente sem uso);
foi corrigido para não renascer com o defeito.

## Onde NÃO se aplica, e porquê

Já estavam **seguros** e não se tocaram — filtram por `event_id` (nível de evento) ou por conta:

`export-dre.ts`, `ReportDREEmpresarial`, `ReportDREBrasil`, `ResultsAnalysis`,
`ReportProfitability`, saldos de conta, extrato bancário, `ReportAccountingExport`
e o gráfico "Margem por Evento".

Em qualquer vista **por evento** a exclusão seria um erro: apagaria a decomposição e o evento
ficaria sem a sua parte do custo.

## Detecção

Invariante `rateio_filhas_nao_somam_a_mae` em `public._run_invariant_checks_raw()`:
soma dos `amount` das filhas de cada mãe = `amount` da mãe, tolerância **0,05 €**,
severidade `error`, referência 0.

Caso real que a estreou (verdadeiro, não falso positivo): fatura Meta **252466632** de
26/06/2026, **9.995,23 €**, repartida por 5 eventos que somam **8.820,66 €** — faltam
**1.174,57 €** por atribuir, e esses não aparecem no DRE de evento nenhum.
