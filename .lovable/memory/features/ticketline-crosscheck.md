---
name: Ticketline crosscheck (portal de Produtores)
description: Edge ticketline-crosscheck diária compara totais do portal produtores.ticketline.pt com os nossos; tabela ticketline_crosscheck_runs; alerta condição (e) da vigia
type: feature
---
- Edge `ticketline-crosscheck` (verify_jwt=true; aceita service_role ou admin/platform_admin). Helper `_shared/ticketline-produtores.ts` (login ASP.NET, lista cboEvento, botão btnOcupacao → relatorio.aspx → /TempReports/*.pdf, texto via unpdf).
- Login UMA vez por corrida; falha → status 'erro' para todos, sem repetir.
- Total portal = 3 primeiros pares "qtd valor" da linha TOTAL (postos, internet, bilheteira).
- Correspondência: data da sessão = events.date E ≥2 tokens do recinto em comum (ou todos se o nosso tiver 1); sem recinto nosso só se único evento nessa data. Nunca por nome. Ids já correspondidos são reverificados primeiro; depois percorre o portal por id desc, ignorando "cancelad", orçamento 120 s.
- Nossos números: regra de src/lib/ticketline-cutoff.ts (ticket_sales até ao corte + ticketline_daily_sales depois, só migrados).
- Tabela `ticketline_crosscheck_runs` UNIQUE(config_id, checked_on) — upsert: rerun no mesmo dia substitui.
- Alerta: condição (e) em check_ticketing_sync_health(), sync_type 'ticketline_crosscheck', anti-spam 12h; ≥3 bilh ou ≥100 € em 2 dias consecutivos; nao_encontrado à primeira.
- Cron `ticketline-crosscheck-daily` jobid 1640, `50 6 * * *`, body {"triggeredBy":"pg_cron"} (sem dry-run). Script em supabase/manual/cron_ticketline_crosscheck_live.sql.
