# Inventário de Relatórios — MP Gestão Eventos

Última atualização: 2026-05-20

Documento agregador dos relatórios financeiros e operacionais. Foco em três
eixos transversais:

- **Overhead**: o relatório respeita o toggle "Com/Sem Overhead" (linhas
  `event_forecasts.is_overhead=true`)?
- **Cenário BP**: o relatório expõe seletor de cenário (versão do BP)?
- **via Master**: o relatório distingue visualmente linhas que vêm
  prorateadas do BP do Master (`_overhead_via_master`)?

Para a semântica de overhead, consultar
[`.lovable/memory/features/overhead-allocations.md`](../../.lovable/memory/features/overhead-allocations.md)
e
[`.lovable/memory/features/master-split-rateio-source-of-truth.md`](../../.lovable/memory/features/master-split-rateio-source-of-truth.md).

## Matriz

| Relatório | Rota | Audience | Toggle Overhead | Default | Cenário | Badge "via Master" | Fonte principal |
|---|---|---|---|---|---|---|---|
| Relatório Business Plan | `/relatorios/business-plan` | Director/Manager | ✅ "Com / Sem overhead" | OFF | ✅ | ✅ (2026-05) | `event_forecasts` + `transactions` |
| BP × Transações (Despesas) | `/relatorios/bp-transacoes` | Manager/Financeiro | ✅ "Com / Sem overhead" | OFF | ✅ | ✅ | `event_forecasts` + `transactions` |
| Previsão vs Real (BP do evento) | aba do evento | Manager/Produtor | ✅ `includeOverheadInComparison` | OFF | ✅ | ✅ | `event_forecasts` |
| DRE | `/relatorios/dre` | Director/Manager | ✅ "Vista Sócio" | OFF (Empresa) | ❌ | ⚠ via subtotal | `transactions` |
| DRE Brasil | `/relatorios/dre-brasil` | Director/Manager | ✅ "Vista Sócio" | OFF (Empresa) | ❌ | ⚠ via subtotal | `transactions` |
| DRE Empresarial | `/relatorios/dre-empresarial` | Director | ❌ (por design) | — | ❌ | — | `transactions` |
| Análise de Resultados | aba do evento | Manager/Director | ✅ `includeOverhead` | OFF | ❌ | ⚠ implícito | `event_forecasts` + `transactions` |
| Acerto com Sócios | `/relatorios/acerto-socios` | Manager/Sócio | sempre ON | ON | ❌ | ⚠ implícito | `event_forecasts` + `transactions` |
| Cash Flow | `/relatorios/cash-flow` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Aging | `/relatorios/aging` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Profitability | `/relatorios/profitability` | Director | ❌ | — | ❌ | — | `transactions` |
| Monthly Evolution | `/relatorios/monthly-evolution` | Director | ❌ | — | ❌ | — | `transactions` |
| Budget Deviation | `/relatorios/budget-deviation` | Manager | ❌ | — | ❌ | — | `event_forecasts` + `transactions` |
| Suppliers | `/relatorios/suppliers` | Financeiro | ❌ | — | ❌ | — | `suppliers` + `transactions` |
| Supplier Concentration | `/relatorios/supplier-concentration` | Director | ❌ | — | ❌ | — | `transactions` |
| Bank Statement | `/relatorios/banco` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Movement Reconciliation | `/relatorios/movement-reconciliation` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Treasury Projection | `/relatorios/treasury-projection` | Director | ❌ | — | ❌ | — | `transactions` + `event_forecasts` |
| Forecast Payables | `/relatorios/forecast-payables` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Contas a Pagar | `/relatorios/contas-pagar` | Financeiro | ❌ | — | ❌ | — | `transactions` |
| Payment Lists | `/relatorios/payment-lists` | Financeiro | ❌ | — | ❌ | — | `payment_lists` |
| Document Pendencies | `/relatorios/document-pendencies` | Manager | ❌ | — | ❌ | — | `transactions` |
| Pendency Index | `/relatorios/pendency-index` | Manager | ❌ | — | ❌ | — | `transactions` |
| IVA Audit | `/relatorios/iva-audit` | Contabilidade | ❌ | — | ❌ | — | `transactions` |
| Accounting Export | `/relatorios/accounting-export` | Contabilidade | ❌ | — | ❌ | — | `transactions` + docs |
| Account Categories | `/relatorios/account-categories` | Admin | n/a | — | ❌ | — | `account_categories` |
| Box Office Audit | `/relatorios/box-office-audit` | Manager | ❌ | — | ❌ | — | `ticket_sales` + `transactions` |
| Occupancy Rate | `/relatorios/occupancy-rate` | Manager | ❌ | — | ❌ | — | `ticket_sales` + `event_ticket_lots` |
| Sales Comparison | `/relatorios/sales-comparison` | Manager | ❌ | — | ❌ | — | `ticket_sales` |
| Sales Curve | `/relatorios/sales-curve` | Manager | ❌ | — | ❌ | — | `ticket_sales` |
| Revenue Mix | `/relatorios/revenue-mix` | Director | ❌ | — | ❌ | — | `ticket_sales` + `transactions` |
| Artist Cache | `/relatorios/artist-cache` | Manager | ❌ | — | ❌ | — | `event_cache_*` |
| Partner Expenses | `/relatorios/partner-expenses` | Manager/Sócio | ❌ | — | ❌ | — | `transactions` |

Legenda:
- ✅ implementado e exposto na UI
- ⚠ a lógica trata overhead mas não há badge dedicado por linha
- ❌ não aplica overhead na visão atual
- — não aplicável

## Decisões de design

- **DRE Empresarial não inclui overhead** (2026-04). Overhead é previsão de
  gestão por evento; não entra no consolidado mensal da empresa, que trabalha
  em valores líquidos sobre transações reais.
- **Toggle default OFF** em `ReportPL`, `ReportBPTransactions` e
  `EventForecast` (Previsão vs Real). Mantém coerência com a Vista Empresa
  do DRE, onde o overhead é informativo.
- **Proração ÷N igualitária** (não-volumétrica) na expansão Master→Splits via
  `expandOverheadToSplits` (`src/lib/overhead-proration.ts`).
- **Badge "via Master"** em sub-eventos identifica fatias virtuais com a flag
  `_overhead_via_master` populada por `expandOverheadToSplits` ou, no caso de
  `ReportPL`, pelo `getEffectiveData` quando o evento corrente é split.
- **Acerto com Sócios sempre ON**: por natureza é a vista do sócio.

## Como adicionar um novo relatório

1. Criar `src/components/ReportXxx.tsx` (componente puro com queries via
   `useQuery`).
2. Criar página em `src/pages/ReportXxxPage.tsx` apenas com `<h1>`,
   `<HelpTooltip>` e o componente.
3. Registar a rota em `src/App.tsx` e adicionar ao índice em
   `src/pages/Reports.tsx`.
4. Avaliar os 3 eixos transversais:
   - **Overhead**: se o relatório agrega valores de `event_forecasts`,
     replicar o padrão do `ReportPL`/`ReportBPTransactions`: state
     `includeOverhead`, default OFF, filtro `(includeOverhead || !f.is_overhead)`,
     badge "Overhead" nas linhas, badge "via Master" quando
     `_overhead_via_master` está presente.
   - **Cenário**: se o relatório olha forecasts e faz sentido para um
     evento âncora, usar `ReportScenarioSelector` + `useScenarioForecasts`
     (ver `ReportPL.tsx`).
   - **Master/Split**: ler
     `.lovable/memory/features/master-split-rateio-source-of-truth.md`
     e
     `.lovable/memory/features/master-split-implementation-guardrails.md`
     **antes** de implementar agregações entre Master e Splits.
5. Atualizar este `INVENTORY.md` adicionando uma linha na matriz.
6. Se o relatório expõe overhead, atualizar também
   `.lovable/memory/features/overhead-allocations.md`.
