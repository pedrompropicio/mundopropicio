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
- Alerta: condição (e) em check_ticketing_sync_health(), sync_type 'ticketline_crosscheck', anti-spam 12h. Limiar (02/10): |diff_qty| ≥ 3 E |diff_qty| ≥ 1% de portal_qty, nas DUAS leituras diárias seguidas; euros NÃO disparam (só informativos); nao_encontrado alerta à primeira.
- Email: a (e) tem secção própria "Divergência com o portal de Produtores" (a captura funciona; diverge só a comparação); assunto próprio se só houver (e). O SQL envia valores como "EUR" e o template desenha &euro; (evita o losango).
- 02/10: portal parado em Almada 127631 (751 / 24.305 €) e Braga 127627 (1.273 / 39.755 €) há 3 leituras; Estoril 127648 mexe. Correspondência confirmada (única sessão nessa data+recinto). Problema da Ticketline, não nosso.
- Cron `ticketline-crosscheck-daily` jobid 1640, `50 6 * * *`, body {"triggeredBy":"pg_cron"} (sem dry-run). Script em supabase/manual/cron_ticketline_crosscheck_live.sql.
