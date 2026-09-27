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

Regra nova (v2.41, 2026-09-16, issue #184) — CAPTURA e LEITURA são independentes:
- `capture_day` (`runCaptureDay`) cobre TODOS os configs `enabled = true` da mesma company do `configId`, independentemente de `daily_fallback_active`. Escreve sempre em `ticketline_daily_sales`. É rede de segurança: se o `.xlsx` voltar a devolver HTML, a série diária já está lá.
- `daily_fallback_active` decide APENAS a precedência de LEITURA (`get_daily_sales_series`, `get_sales_position`, `get_sales_position_by_provider`, `vw_event_daily_sales`) — inalterada.
- A flag só DESCE por decisão humana (UI ou SQL). O caminho `.xlsx` com sucesso deixou de a pôr a `false` (era o único sítio; anulava a captura e deixou 5 cidades do Ghanem sem vendas de 14/09 a 16/09).
- Sem alvos, `capture_day` grava uma corrida `status = "skipped"` em `ticketline_sync_runs` com `error_message` explicativo — já não devolve 200 sem rasto.

Decisão de arquitectura (2026-09-27) — ACUMULADO COM CORTE nos eventos migrados:
- Num evento migrado o acumulado é o histórico congelado até à data do corte mais a série diária depois dela; são períodos disjuntos, com fronteira registada, e isso não viola a doutrina de fontes, que proíbe somar duas fontes para o mesmo período.
- Marca e fronteira: `ticketline_sync_config.promotores_migrated_at` (timestamptz) + `promotores_cutoff_date` (date, inclusive do lado do `ticket_sales`). Restrição `ticketline_cutoff_requires_migrated`. RG - Lisboa: corte 2026-09-24.
- Regra numa só função partilhada: `src/lib/ticketline-cutoff.ts` (fetchTicketlineCutoffs / keepTicketSaleRow / cumulativeWithCutoff). Usada na capa, aba Bilheteira, BI de ocupação, lista das bilheteiras, presenças/simulador. DRE e Fecho não usam.
- A série diária não tem zona: a parte depois do corte entra no total do evento; a repartição por zona e a ocupação ficam congeladas na última leitura e mostram-se sempre com "última leitura DD/MM".
- `daily_fallback_active` NÃO significa "migrado": liga-se também em eventos não migrados (Almada, Estoril, Albufeira, Santarém) cuja série diária é parcial — começou quando a capture_day arrancou. Usá-la como critério de migrado trocaria o acumulado pela série e tiraria bilhetes (no Almada, um bilhete; no Porto seriam 1.782 se lá estivesse ligada). Só `promotores_migrated_at` decide o corte.
