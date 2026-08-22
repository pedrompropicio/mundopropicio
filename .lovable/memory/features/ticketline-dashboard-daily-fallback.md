---
name: Ticketline dashboard daily fallback
description: Eventos Ticketline migrados alimentam-se da série diária do Resumo do dashboard (padrão BOL), via ticketline_daily_sales + daily_fallback_active
type: feature
---
Provado nas sondas v2.27/v2.28 (não reinvestigar): nos eventos migrados para a nova área de Promotores o relatório POR EVENTO (`/managers/events/<id>/sale_summary`) vem sempre a ZEROS e o `.xlsx` devolve a landing. Os números reais estão em `/managers/dashboard/sale_summary` filtrado por `bulk_event_ids`; o período fixa-se por POST `period=5` + datas e os dados lêem-se por SJR (`post_render_content=data`, Accept text/javascript + X-Requested-With + csrf).

Implementação (v2.29, 2026-08-22):
- `fetch-ticketline-reports`: quando o `.xlsx` por-evento devolve HTML → `dashboardDailyFallback` (POST period=5 → SJR; se não cobrir o período, 2ª tentativa só GET; se ainda assim só devolver o dia corrente falha com phase `dashboard_daily_incomplete` — NUNCA gravar série incompleta).
- Parser `_shared/ticketline-dashboard-daily-parser.ts`: colunas "Total Vendas" (fallback "Total Geral"), meses PT/EN, validação bloqueante da linha TOTAL vs soma dos dias.
- Import: full-replace em `ticketline_daily_sales` (delete + insert, dias a zero omitidos) e `ticketline_sync_config.daily_fallback_active=true`. NÃO toca em `ticket_sales` desses eventos (fica congelado). Caminho `.xlsx` normal põe a flag a false. Run: success, `source_mode="dashboard_daily"`.
- RPCs `get_sales_position`, `get_sales_position_by_provider`, `get_daily_sales_series`: eventos com `daily_fallback_active` lêem janelas E total de `ticketline_daily_sales` (provider 'Ticketline') e ignoram `ticket_sales`. Nunca misturar fontes no mesmo evento.
