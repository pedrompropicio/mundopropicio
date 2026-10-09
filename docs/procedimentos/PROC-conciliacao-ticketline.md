# PROC — Conciliação Ticketline (séries paralelas, #78)

Quando usar: no fecho de um evento Ticketline, ou quando o invariante
`ticketline_series_paralelas` deixar de estar conforme.

1. No portal Ticketline (área manager), abrir o relatório **"Vendas por Evento"**.
2. Para cada evento, ler a coluna **Total Vendas** (nunca "Total Geral", que inclui convites).
3. Comparar com o total do mesmo evento no ERP (`vw_event_daily_sales` ou
   `get_daily_sales_series`, nunca somas directas a `ticket_sales`).
4. Se o ERP tiver mais do que o relatório, procurar vendas em zonas criadas pela
   sync (`sync_generated`) que o último relatório já não traz — foi o caso do
   Deive Braga (22/06–22/08, 227 bilhetes / 8.405,00 € a dobrar).
5. Desde D-ERP214 o importador apaga a série antiga em todas as zonas do evento
   no período do relatório e marca o run `warning` se a BD divergir do relatório.
   Se ainda assim aparecer divergência, reimportar o evento e conferir de novo.
