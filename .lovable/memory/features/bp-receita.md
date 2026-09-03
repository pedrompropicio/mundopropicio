---
name: BP de receita (sub-separadores + linhas sintéticas)
description: Aba Business Plan com sub-separadores Despesas|Receitas e linhas sintéticas por módulo (bilheteira 1.1.01, A&B 1.1.03) com previsto original / corrente / real
type: feature
---
DR-2026-09-03-D21 (issue #103, ronda 1).

- D9: aba Business Plan tem sub-separadores **Despesas | Receitas** (substituem o
  select "Receitas + Despesas / Só Receitas / Só Despesas"); cards de resumo
  sempre visíveis; filtros/vistas/botões aplicam-se ao sub-separador activo.
- Linhas **sintéticas** (não persistidas, não editáveis) para rubricas com módulo,
  com TRÊS colunas: previsto original / previsto corrente / real.
  - Bilheteira 1.1.01: original = `Σ event_ticket_zones.total_capacity` × preço
    médio de planeamento (lotes `quantity>0`, `price>0`, `sync_generated=false`,
    ponderado, líquido; fallback preço médio real) e FIXADO em
    `events.ticketing_baseline_net`/`ticketing_baseline_at`; corrente = Simulador
    (`event_simulator_inputs` + `computeScenarioRevenue(..., "forecast")`);
    real = `ticket_sales` via `sumTicketSalesRevenue`, líquido pelo IVA do LOTE.
    IVA efectivo por lote — nunca "R01"/6% fixos.
  - A&B 1.1.03: corrente = cenário A&B (`useEventABScenarios`), real =
    `useEventABRealized`, original em `events.ab_baseline_net`/`ab_baseline_at`.
  - Metadados: carga inicial, carga corrente + data (D20), vendidos e %.
- Totais e estado vazio somam sintéticas + reais + manuais (sem o fallback antigo
  que só olhava a `event_forecasts`); o card de Receitas bate ao cabeçalho (D11:
  linha a linha).
- Patrocínios: linhas reais 1.2.*; `syncSponsorToBP` só aceita `stage='closed'`.
- Código: `src/lib/bp-income-synthetic.ts` (cálculo partilhado),
  `src/hooks/useBPIncomeSynthetic.ts` (UI), `src/components/EventForecast.tsx`,
  `src/lib/export-event-bp-pdf.ts` (PDF inclui a sintética).
- Ronda 2 (pendente): verba por segmento de patrocínio e encerramento datado da
  captação.
