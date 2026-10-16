---
name: Regra única de receita de bilheteira
description: Receita por linha de venda = total_value; fallback quantity × unit_price só se NULL. Um só helper (ticketSaleRevenue) em todo o sistema — cachê, card, fecho, DRE, P&L, exports
type: feature
---

# Regra única de receita de bilheteira (16/10/2026, D-ERP285)

**Regra:** receita de bilheteira por linha de `ticket_sales` = `total_value`;
só se `total_value` for NULL cai para `quantity × unit_price`. Líquido =
bruto da linha / (1 + iva_rate do lote/100), default 6. Ocupação e quantidade
não mudam.

**SSoT:** `ticketSaleRevenue(sale)` / `sumTicketSalesRevenue(sales)` em
`src/lib/ticket-sales-revenue.ts`. Na base, o equivalente é
`coalesce(total_value, quantity * unit_price)` (já usado pela RPC canónica
`get_event_ticket_sales_totals` e por `get_ticket_office_sales`).

**Porquê:** o `unit_price` vem arredondado da importação e acumula diferença
(ex.: 2.644,80 / 82 = 32,253658…). Caso Deive Lisboa: a aba Cachê somava
41.382,49 bruto / 39.040,08 líquido onde card e fecho diziam 41.385,00 /
39.042,45 — cachê ~0,95 € abaixo.

**Invariante:** para o mesmo evento, receita do cachê = receita do card =
receita do fecho da bilheteira. Teste: `src/lib/__tests__/ticket-revenue-single-rule.test.ts`.

**Consumidores alinhados ao helper (16/10):** `computeTicketRevenueAndOccupancy`
(núcleo do cachê real — alimenta useRealCacheCalculation, grelha /eventos via
events-list-cache-impact, computeTourCityCacheAmount/#301, ReportArtistCache via
cache-report.ts), useSyncCacheForecasts (fingerprint + turnê + evento simples),
EventForecast (P&L do evento), TicketOfficeEventsList, ReportOccupancyRate,
ReportDRE, ReportDREBrasil, export-dre, export-pl, TicketManagement,
TicketOfficeTicketingTab. Já estavam correctos (total_value com fallback):
event-revenue-basis (via RPC), bp-income-synthetic, event-simulator-forecast-live,
useEventContractResult, useEventSettlementEngine, DashboardCharts, ResultsAnalysis,
SalesLogPanel, PartnerSettlementTab, EventTicketing (vendas), IvaManagement.

**Ficam de fora de propósito:** somas de receita PLANEADA a partir de lotes
(`lot.quantity × lot.price` — projecção "100% vendido", alocação por zona,
event-attendance-calc) — não são vendas reais. Parsers de importação
(Ticketline/BOL/Fever) escrevem `total_value`, não somam receita.

**Nunca** reintroduzir `quantity * unit_price` como soma de receita real sem
passar pelo helper; e nunca somar `ticket_sales` no cliente sem paginação
(barreira dos 1.000 — ver constraints/postgrest-1000-barrier).
