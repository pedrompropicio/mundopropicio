# #269 — Capa do evento e BP lentos (Coala 2026) — diagnóstico

Data: 02/10/2026. Só diagnóstico: nenhum código, valor ou critério alterado.

## Como foi medido

- Base de dados: `EXPLAIN ANALYZE` em Live das leituras principais do Coala 2026
  (5a1da5fb). O service role não existe no sandbox (Lovable Cloud); usei a leitura
  só de consulta.
- Navegador: Playwright com a sessão do Pedro, a gravar cada pedido à base
  (início, duração, linhas), as tarefas longas do navegador (PerformanceObserver
  `longtask`) e um perfil de CPU de 15 s (CDP Profiler).
- **O Coala não foi aberto no navegador**: é da empresa 7d831e59 e a empresa activa
  do Pedro está em 7c858982 (MP). Mudar a empresa activa mexia no estado dele; não
  mexi. Medi no navegador o Anitta EDA 2026 (fdfb39fe) e o Ivete Clareou 2026
  (4fca2381), que usam o mesmo código; o Coala tem o dobro a triplo das linhas de BP.
- Numa primeira volta os dois eventos correram em paralelo (CPU partilhada); a
  segunda volta (tarefas longas) também. Os valores absolutos de ms no navegador são
  por isso pessimistas, mas a proporção é a mesma.

## Dimensão (Live)

| Evento | ticket_sales | lotes | TX | linhas BP activas | estado |
|---|---|---|---|---|---|
| Coala 2026 | 534 | 45 | 367 | 361 | completed (realizado) |
| Anitta EDA 2026 | 389 | 12 | 301 | 192 | active |
| Ivete Clareou 2026 | 326 | 8 | 334 | 129 | active |

No Coala o evento está realizado: `computeLiveTicketForecast` NÃO corre
(desde b550d24b). Não é o simulador que pesa hoje.

## Tempo na base de dados (Coala, EXPLAIN ANALYZE)

| Leitura | linhas | ms |
|---|---|---|
| ticket_sales do evento (via zonas) | 534 | 0,7 |
| transactions do evento + rubrica + fornecedor (`select *`) | 367 | 1,5 |
| event_forecasts activos + rubrica | 361 | 0,9 |
| anexos de todas as linhas do BP numa só consulta | 133 (0 ligados ao Coala) | 0,5 |
| get_event_ticket_sales_totals | — | sem permissão para o papel de leitura; no navegador 0,25–1,6 s com a fila |

Conclusão: a base responde em milissegundos. O atraso está no navegador.

## Pedidos ao abrir (navegador, Anitta / Ivete)

Capa: 81 / 102 pedidos lançados; os dados chegam todos até ~10 s. Separador BP:
55 / 77 pedidos lançados.

| Pedido | linhas | ms (capa) | ms (BP) | série/paralelo | execuções por abertura |
|---|---|---|---|---|---|
| events (várias colunas soltas) | 1 | 130–490 | 950–1.360 | paralelo na capa, série no BP | 11 / 17 na capa + 5 no BP |
| transactions do evento (5 selects diferentes) | 7–392 | 240–1.030 | 1.430–1.800 | paralelo | 7 / 9 na capa + 3 no BP |
| transactions de toda a empresa (`event_id, amount, type`, paginado) | 1.000 + 392 | 520–1.030 | — | série (2 páginas) | 1 |
| event_forecasts (selects diferentes) | 0–192 | 250–400 | 370–1.600 | paralelo | 9 / 13 na capa + 1–2 no BP |
| rpc get_event_ticket_sales_totals | 1 | 350–950 | 890–1.620 | paralelo | 3 / 5 na capa + 1 no BP |
| ticket_sales LINHA A LINHA (zone_id… sale_date) — `useEventAttendance` | 389 / 326 | 280–330 | 890–1.540 | — | 1 na capa + 1 no BP |
| ticket_sales LINHA A LINHA (lot_id, quantity, unit_price, total_value) — `computeTicketSynthetic` | 389 / 326 | 300 | — | série dentro da função | 1 |
| event_ticket_zones | 2–3 | 290–380 | 1.020–1.470 | série no BP | 2 + 3 |
| event_forecast_attachments, 1 pedido POR LINHA do BP (`EventForecast.tsx:3518`) | 0 | — | nenhum terminou em 70 s | por linha | 20 / 45 lançados em 70 s (192 / 129 linhas); no Coala seriam 361 |
| sponsorship_*, event_ab_*, event_dates, event_sessions, lots, courtesies, settlements, ticketline_sync_config | 0–12 | 230–490 | 680–1.750 | série no BP | 1–3 |

Nenhum caminho da capa ou do BP soma `ticket_sales` para a receita: a receita usa
`get_event_ticket_sales_totals`. As duas leituras linha a linha servem as presenças
(`useEventAttendance`, para A&B) e a quantidade vendida da linha sintética
(`computeTicketSynthetic.soldQty`). Com < 1.000 linhas não truncam, mas são
repetidas.

## Tempo do navegador bloqueado (tarefas longas)

| Evento | capa (0–71 s) | BP (71–145 s) | maior tarefa no BP |
|---|---|---|---|
| Anitta | 52,7 s bloqueado | 73,4 s bloqueado | 725 ms |
| Ivete | 48,1 s bloqueado | 72,2 s bloqueado | 550 ms |

Perfil de CPU da capa da Ivete, 15 s, a partir dos 25 s (dados já todos
chegados): 12,8 s de CPU ocupada; 43 % dentro do desenho de `EventDetail`, 28 % em
`formatDate` (lista de transações do Resumo, redesenhada a cada volta), o resto é o
React a reconciliar. Ou seja: a página não pára de se redesenhar.

## As 3 causas, por tempo que custam

### 1. Ciclo de redesenho infinito capa ⇄ cards (≈ 50 s de 70 s na capa; arrasta o BP)

`useEventFinancialCardData` usa `const { data: masterTxsAll = [] }` e
`masterForecastsAll = []` em queries desligadas (evento sem Master). O `= []` cria
um array novo a cada desenho → `masterTxs`/`masterForecasts` (useMemo) mudam →
`ebitdaParcels` (useMemo) é um objecto novo → o efeito do `EventFinancialCard`
chama `onEbitdaParcelsChange` → `EventDetail` faz `setIncomeEbitda` /
`setExpenseEbitda` com objecto novo → redesenha → volta ao início. Corre sem parar
enquanto a página está aberta. Como o separador BP é filho de `EventDetail`, o
`EventForecast` (4.700 linhas, 1 linha de ecrã por linha de BP) é redesenhado em
cada volta: no Coala, 361 linhas.

Efeito secundário: com o navegador ocupado, cada pedido à base leva 1–1,8 s a ser
entregue em vez de 0,25 s, e os pedidos que dependem uns dos outros ficam em fila.

Correção proposta: constantes `EMPTY` estáveis nos defaults das queries (como já
existe `EMPTY_TICKET_SALES` na capa) e, por segurança, comparar por valor antes de
chamar `onEbitdaParcelsChange` / `onPerimeterChange`. **Não muda nenhum valor
apresentado.**

### 2. Anexos pedidos um a um por linha do BP (N+1; no Coala 361 pedidos)

`EventForecast.tsx:3518` abre uma query `event_forecast_attachments_counts` por
linha. Em 70 s o navegador só conseguiu lançar 20 (Anitta) e 45 (Ivete), nenhum
terminou. No Coala são 361 pedidos, cada um com custo de rede próprio, contra
0,5 ms para a mesma informação numa só consulta (já feita assim em
`src/lib/bp-closing-data.ts:180`). Somado ao ciclo da causa 1, é o que deixa o
separador BP minutos a desenhar.

Correção proposta: uma query por evento (`in("forecast_id", ids)` ou por
`event_id`), contagem num mapa partilhado por queryKey do evento; a linha só lê
do mapa. **Não muda nenhum valor apresentado.**

### 3. Leituras em série e repetidas na receita/sintéticas (≈ 54 s em série no BP do Anitta com o navegador ocupado; ~5–6 s sem a causa 1)

No BP correm em fila ~23 pedidos (Anitta 73 s → 127 s). Origem:
- `computeEventRevenueBasis`: `Promise.all` → depois `computeSponsorshipSynthetic`
  → depois `fetchEventRealized` → depois o simulador → depois `event_forecasts`,
  tudo com `await` em série, embora sejam independentes.
- `computeTicketSynthetic`: zonas → lotes → `ticket_sales` linha a linha → RPC →
  `fetchEventRealized`, em série.
- A mesma coisa lida várias vezes com queryKeys diferentes: `events` 11–17×,
  `transactions` do evento 7–9× (selects diferentes), a RPC de vendas 3–5×,
  `ticket_sales` linha a linha 2–3×.
- `useEventRevenueBasis` tem `abForecastNet` na queryKey: enquanto as presenças de
  A&B chegam por partes, o valor muda e a receita inteira é recalculada de novo.

Correção proposta: paralelizar as leituras independentes dentro das duas funções;
`soldQty` pela RPC `get_event_ticket_sales_totals` (mesma soma, já usada para o
real); partilhar leituras de `events`/`transactions` por queryKey comum; só
calcular a receita quando o A&B estiver carregado (não com `null` primeiro).
**Não muda nenhum valor apresentado** (a quantidade vendida pela RPC é a mesma
soma de `ticket_sales.quantity`).

## Ordem sugerida

1 primeiro (é o que multiplica tudo o resto e é uma correcção pequena); depois 2;
depois 3. Medir de novo no Coala depois de 1, com o Pedro na empresa do Coala.

## Correcções aplicadas (1 e 2) — 02/10/2026

Nenhum valor nem critério de receita/custo mudou; só quando e quantas vezes se
desenha e se pede.

**Causa 1 — ciclo capa ⇄ cards.**
- Defaults `= []` / `= {}` de `useQuery` trocados por constantes estáveis de módulo
  (`EMPTY_ARR_STABLE`, `EMPTY_OBJ_STABLE`) em `useEventFinancialCardData.ts`,
  `EventDetail.tsx`, `useEventCacheImpact.ts`, `useEventContractResult.ts`,
  `useEventAttendance.ts`, `useEventABScenarios.ts` e `EventForecast.tsx`.
- `EventFinancialCard.tsx`: `onPerimeterChange` e `onEbitdaParcelsChange` só são
  chamados quando o conteúdo muda (comparação por valor com o último enviado, em ref).
- `EventDetail.tsx`: `setIncomeEbitda`/`setExpenseEbitda` passam por setters que
  mantêm o estado anterior quando o conteúdo é igual.
- Prova: `src/test/event-financial-card-render-loop.test.tsx` — 1 chamada, estável
  ao fim de 1 s, sem desenhos novos. Com o código antigo reposto à mão o mesmo teste
  dá **411 chamadas em 0,5 s** (falha).

**Causa 2 — anexos N+1.**
- `src/hooks/useForecastAttachmentCounts.ts`: uma leitura por evento (evento +
  sub-eventos), queryKey `["event_forecast_attachments_counts", eventId]`, mapa
  `forecast_id → nº`. `ForecastRow` lê do mapa. A invalidação por prefixo que o
  `BPNotesAttachmentsModal` já fazia cobre a nova chave.
- Prova: `src/test/forecast-attachment-counts.test.tsx` — 361 linhas → 1 pedido a
  `event_forecast_attachments`.

Verificação: tsgo sem erros; vitest 768 passam, 9 falham — as mesmas 9
pré-existentes (EventABTab, storage-multi-tenant, postgrest-embeds,
postgrest-row-limit, forecast-boost).

Causa 3 fica por tratar; medir de novo no Coala depois do Publish.
