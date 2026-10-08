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
- **D-ERP191 (08/10/2026) — fonte trocada.** O PDF (btnOcupacao) continua a ser lido e gravado (portal_qty/diff_*/status), mas é SÓ informação. Fonte principal: variação diária do occupation.xlsx (`event_zone_capacities`, released, source ticketline_occupation; 1 linha por zona por dia) vs variação de `our_qty` (já pela regra do corte). Níveis absolutos xlsx vs nossas NUNCA se comparam (xlsx inclui convites; Almada ~80 lugares).
- RPC `ticketline_crosscheck_signals(_as_of)` (service_role): 3 deltas diários seguidos terminando em _as_of. (e) = nos 3 dias |dx−dn| ≥ 5 E ≥ 50% do maior. (g) = Σdx ≥ 10 E Σdpdf ≤ 20% de Σdx → PDF parado com xlsx a mexer = defeito do fornecedor.
- Email (e)/(g): 1 por dia (data de Lisboa), não 12h; sync_type `ticketline_crosscheck` / `ticketline_pdf_stale`. `nao_encontrado` deixou de alertar.
- Prova 03–08/10: (e) silenciosa em todos os eventos; (g) dispara no Braga 03–08 e Almada 04–08 (03/10 não: xlsx só +4).
- 08/10: email desligado; aviso passa ao Dashboard via `get_ticketing_divergences()` (D-ERP192), isolado por empresa.
