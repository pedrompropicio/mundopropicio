---
name: Ticketline occupation / carga corrente
description: Captura diária de ocupação por zona (occupation.xlsx + BOL) em event_zone_capacities e mapeamento às zonas do ERP via zone_capacity_snapshot
type: feature
---
Duas cargas (DR-2026-09-03-D20): carga inicial = capacidade das zonas no
planeamento (fixa, denominador do "correu como se planeou"); carga corrente =
último retrato diário de `event_zone_capacities` (o que está à venda).

- Ticketline: `GET /managers/events/{id}/occupation.xlsx`; colunas
  `ZONA | OCUP. MÁX. | DISP. | BLOQ. | Qt. ocupada`; linha Total valida a soma
  (não bate → não escreve); disponível negativo é aceite.
- Escreve `event_zone_capacities` com `capacity_kind='released'`,
  `source='ticketline_occupation'`, 1 linha por zona por dia. BOL escreve na
  mesma tabela com o mesmo `capacity_kind` e `source='bol_m2'`.
- Cron: sem cron novo — a captura corre dentro do `ticketline-sync-daily`
  (`5 * * * *`, fan-out por config), DEPOIS do sale_summary; nunca aborta as
  vendas; audita em `ticketline_sync_runs.import_audit.occupation`; em cron só
  1×/dia por evento, em manual sempre.
- Mapeamento: `zone_capacity_snapshot(_event_id, _on)` + `normalize_zone_label()`
  (prefixo antes de " - " e " | ", sem acentos/espaços duplos/maiúsculas) casa
  "ARENA - Lote 2 - JARDINS DO CASINO ESTORIL" com a zona "ARENA"; devolve
  `unmatched_labels` para a UI não perder rótulos.
- Simulador: projecção por defeito nasce da carga corrente (fallback:
  capacidade − vendido), nunca acima dela (baixa + nota "projecção ajustada à
  carga corrente de <data>"); `capacity_target` continua a ser a capacidade.
