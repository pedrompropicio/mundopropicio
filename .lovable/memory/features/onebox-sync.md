---
name: Onebox sync (dash.oneboxtds.com — H&K Madrid)
description: Captação horária das vendas do H&K Madrid pela edge function fetch-onebox-dashboard com login próprio no Superset, cron onebox-sync-hourly e conferência tripla; dry_run é o default e tem de vir false explícito
type: feature
---

## Estado em produção (2026-09-21)

`fetch-onebox-dashboard` + cron **`onebox-sync-hourly`** (jobid **349**, `35 * * * *`,
24h por dia, no molde do BOL `:25` e da Ticketline `:05`/`:15`). Substituiu a captação
pelo Chrome do Pedro, que dependia da sessão dele no browser e falhou cinco vezes na
manhã de 21/09 (401 em `/api/v1/me/`). Primeira corrida real, 14:07 de Madrid:
**1.271 bilhetes / 65.581,75 €** (a captação pelo Chrome tinha deixado 1.257 / 64.366,75 €).

## ARMADILHA — `dry_run` é o default

**A `fetch-onebox-dashboard` assume `dry_run` quando o parâmetro NÃO é enviado.** O
primeiro cron foi criado sem ele e teria corrido de hora a hora a dar sucesso sem gravar
nada. O corpo do pedido **TEM de levar `"dry_run": false` explícito**
(`{"mode":"hourly_edge","dry_run":false}`). Corridas `success` com números parados:
verificar isto primeiro.

## Login próprio (não é API da GTS)

Secrets `ONEBOX_DASH_USER` / `ONEBOX_DASH_PASSWORD`. `GET /login/` → `csrf_token` do input
escondido → `POST /login/` → 302 → `/api/v1/me/` 200 → `/api/v1/dashboard/43` 200.
O endpoint `POST /api/v1/security/login` devolve 401 e **não é o caminho** — durante duas
semanas assumiu-se que isso significava "sem acesso programático".
`dash.oneboxtds.com` deixa passar o IP das edge functions; `tickets.oneboxtds.com` dá 403
e a Fever 401.

## Leitura

Descoberta dinâmica: `GET /api/v1/dashboard/43/charts` (o `form_data` traz as métricas como
objectos) e `GET /api/v1/dashboard/43/filter_state/<key>` (**sem barra final**; com barra dá
404). Dados por `POST /api/v1/chart/data` com header `X-CSRFToken` e **`dashboardId: 43`** no
`form_data` — sem ele dá 403 `DATASOURCE_SECURITY_ACCESS_ERROR`, porque a conta só tem
acesso ao datasource 33 por contexto de dashboard.

Três leituras seguidas, mesma sessão: grelha sessão × canal (slice **180**), série por
`fechahoracompra` (slice 180) e resumo (slices **186** e **1723**). Chart 1149 (Fecha
Actualización) devolve 403 por esta via — campo `null` no `import_audit`, não é falha.

## Conferência tripla = trava de escrita

Grelha = série = resumo, **ao cêntimo**, em entradas e facturación. Se não baterem, a
corrida **não escreve nada** e registra falha em `onebox_sync_runs`; o lote anterior fica
intacto. As três leituras fazem-se seguidas porque diferenças de poucos bilhetes entre
leituras espaçadas são vendas reais.

## Escrita

- `ticket_sales` — acumulado actual, `source = 'onebox_import'`, `delete` + `insert` numa só
  instrução (CTE). `total_value` = **só a Facturación** (nunca Total ingresos);
  `unit_price` = facturación ÷ entradas; zona por sessão (`DD/MM/AAAA HH:MM`, por `zone_id`),
  lote com **`iva_rate = 10`** (o default 6 inflaciona o líquido); canal em `notes`
  (`Onebox • …`); `financial_account_id` da conta **ECI**
  `00687bfd-8dd7-475a-a530-615605e9d135`; `company_id` explícito; linhas com 0 entradas
  ignoradas.
- `onebox_daily_sales` — upsert por `(event_id, sale_date)` de **todos os dias da série**;
  a série vem da data de compra, logo falhar horas não corrompe o histórico.
- `onebox_sync_runs` — sempre, com sucesso ou sem ele; modos `hourly_edge` / `daily_edge`.
- Invariante: soma de `onebox_daily_sales` = acumulado de `ticket_sales`. Dia negativo é
  legítimo (devoluções).

## Contexto do evento

H&K Madrid `bf9ce2d8-754e-4485-8427-e2d486c39919`, company MP
`7c858982-6ccd-47ca-bd65-e0dd3eebf01c`. Lançamento de sessões faseado: sessões retidas
não se leem como fraqueza de vendas. Procedimento completo em
`docs/procedimentos/PROC-vendas-onebox-madrid.md`; decisão em `docs/DECISIONS.md` (D-ERP121).

## Pendente

Desligar as duas tarefas agendadas do Chrome (captação + keep-alive) e apagar as funções
descartáveis `probe-onebox` e `probe-onebox-login`, depois de comparadas 24 horas das duas
origens — issue P2 aberta na frente `ticketing-e-receita`.
