---
name: Cachê no card de Custos (turnê e simples)
description: Regra #259 — o cachê calculado não soma ao custo quando as linhas do módulo de cachê já estão no BP considerado; função única cacheImpactOnTopOfCost
type: feature
---
- "Se há módulo, o módulo é a fonte — uma vez só."
- Base Previsto + excedido / Forecast: se o BP aprovado considerado (cidades + master) tem linhas `formula_type='cache_module'` ou `cache_config_id`, o cachê calculado soma 0; o card mostra "Cachê (já no BP, não soma)" só como decomposição.
- Base Realizado (só transações): o cachê ainda não lançado continua a somar.
- Função única: `cacheImpactOnTopOfCost` (shared event-cost-basis). Consumidores: useEventFinancialCardData, useEventContractResult, events-list-financials. Fecho e DRE não somam cachê calculado.
- Aceitação: Turnê Simone Mendes 2026 → Custos 411.236,45 €, Lucro −23.859,09 € (antes 566.187,39 / −178.810,03).
