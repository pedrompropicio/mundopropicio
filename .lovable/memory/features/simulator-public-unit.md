---
name: Simulator public unit (Pagantes×dia)
description: Cards Hoje/BE/Forecast do Simulador mostram só pagantes×dia; cortesias só informativas
type: feature
---

Decisão (2026-05-06, revista 2026-05-10): nos 3 cards do trio Hoje / Break
Even / Forecast (e no card "Público presente / dia (Hoje)" do Dashboard
interno) a unidade exibida é **Pagantes × dia**, não "presenças×dia".

Motivo: BE e Forecast só consideram bilhetes pagantes para a receita de
bilheteira; somar cortesias só no card Hoje quebrava a comparação dos 3
cenários. Cortesias continuam a impactar A&B (consumo) mas são exibidas
apenas como linha "informativa" abaixo do total quando > 0.

- 1 Passe 2 dias pagante = 2 pagantes × dia.
- Cortesias → linha "Cortesias (informativo) +N", não somam ao total.
- ExecutiveDashboard.tsx KPI grande "Presenças × dia" mantém a soma
  pagantes+cortesias (é o KPI de público físico presente no recinto, usado
  para A&B per capita) — não confundir com os 3 cards do trio.
- `useEventAttendance` / `expandLotSalesToDailyAttendance` continuam a
  expandir combos (1 Passe N dias = N), só mudou o que se mostra.

Não confundir com a Bilheteira / Reports onde "Bilhetes vendidos" continua
a contar 1 ingresso = 1 (unidade comercial).

Dashboard `src/pages/Index.tsx` (card do evento ativo, tabela "Por zona"):
desde 2026-05-28 a tabela mostra **presenças/dia** — para cada venda de
lote combo (`is_combo=true`) a qty é somada em CADA zona de
`consumes_zone_ids` (ex.: Passe 2 dias Coala = +1 Sáb e +1 Dom). A €
recebida é dividida por N para a soma por zona reconciliar com a "Receita
Bilheteira" total. Os totais por evento (Ontem / 7d / Total no header)
continuam a contar a venda original uma só vez.
