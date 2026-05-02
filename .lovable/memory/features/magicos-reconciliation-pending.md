---
name: Mágicos H&K reconciliation pending
description: Reconciliação pendente entre sistema e ficheiro Excel do sócio na turnê "Mágicos Henry & Klaus" (Lisboa+Porto). Bugs corrigidos: receita c/IVA (28/Abr), Distribuição turnê dessincronizada (29/Abr) e cards do Portal do Sócio em NET sem filtro (02/Mai/2026).
type: feature
---

## Bugs corrigidos

**1) Receita de bilheteira no DRE Brasil (28/Abr/2026)** — `unit_price` em `ticket_sales` é c/IVA. `buildDREBrasil` agora extrai IVA do `lot.iva_rate` (default 6%).

**2) Distribuição de Resultados da Turnê (29/Abr/2026)** — Os painéis "Resumo da Turnê" em `ReportDRE.tsx` e `ReportDREBrasil.tsx` recalculavam a distribuição com fórmulas próprias sobre os totais agregados (`tourIncEx − tourExp*`), divergindo dos cards do topo (que somam shares por split via linhas `isDistribution`). Agora **agregam diretamente as shares dos splits** (mesma fonte dos cards), garantindo consistência. Aplicado a sócios externos e à quota residual da Mundo Propício.

**3) Cards do Portal do Sócio (02/Mai/2026)** — `PartnerEventDetail` mostrava despesas em NET e contava transações `pending`/transitórias/`exclude_from_result`, divergindo do Fecho dos Sócios. Agora alinhado com `buildPartnerSettlementReportData`:
- Filtro: `status ∈ {approved,paid}` AND `!is_transitory` AND `!exclude_from_result` (aplicado tanto a TX locais como a Master rateadas ÷N)
- Overheads: filtro adicional `status='approved'`
- Cards e lista hierárquica: receitas em **NET**, despesas em **BRUTO (com IVA)** — vista Brasil
- "Pago" continua a usar `paid_amount` (já bruto por convenção)

**Regra canónica**: Distribuição em painéis de turnê = **soma das shares por split**, nunca recalcular sobre totais agregados. Cards do Portal do Sócio = mesmas regras de filtro/IVA do `buildPartnerSettlementReportData`.

## Estado de reconciliação

Após as correções, cards e painel da turnê devem mostrar (Mágicos H&K, Vista Sócio ON):
- HENRY & KLAUS (70%): **+33.322,70 €**
- MUNDO PROPÍCIO (30%): **+14.281,16 €**
- Resultado total: **+47.603,86 €**

Comparar novamente com ficheiro do sócio (€3.244,49) — diferença residual a investigar:
1. Despesas Master ausentes no ficheiro (~€3.763,80: campanha JCDecaux + produção)
2. Linhas "descontar da bilheteira" no ficheiro tratadas como dedução vs no sistema como despesa bruta
3. Itens "EM NEGOCIAÇÃO" ainda não registados no sistema

## Artefactos
- `/mnt/documents/comparativo-magicos-sistema-vs-ficheiro_v2.xlsx`
