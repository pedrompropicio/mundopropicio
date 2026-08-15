---
name: BOL sync (produtores.bol.pt)
description: Sync diária do mapa M2 "Tipo de Venda" da BOL (MapasProdutor.aspx) para ticket_sales com uma zona por setor, no molde da fetch-ticketline-reports v2.8
type: feature
---

## Estado em produção (2026-08-14)

Sync 100% funcional em produção — `fetch-bol-reports` v1.5_reportviewer.
- 3/3 eventos importados e validados:
  - Deive Leonardo Lisboa — 267 bilhetes / 11.634,00 €
  - Conferência de Mulheres Plenitude — 436 bilhetes / 64.031,00 €
  - RG Europarque (Santa Maria da Feira) — 13 bilhetes / 425,00 €
- Cron `bol-sync-daily` aplicado no Live: `20 23 * * *`, timeout 300.000 ms.

## Desenho

Espelho do sync Ticketline v2.8:

- **Auth** — service role estrito, `jwtRole()=='service_role'` (cron via Vault) ou JWT de
  utilizador com role admin/manager/editor/platform_admin.
- **Fan-out** — chamada sem `configId` = mãe orquestradora: `fetch` à própria função por config
  (sequencial, timeout 120s). Evita `WORKER_RESOURCE_LIMIT` no parse de vários PDFs.
- **Conta única no Vault** — `bol_master` (JSON `{email,password}`), gravado pela edge fn
  `update-bol-credentials` a partir da UI. `bol_<event_id>` só se se ligar "usar outra conta".
- **Cache de sessão** — `Map<vault_secret_name, Jar>` por invocação; self-heal (re-login uma vez)
  só em `session_expired`.

## BD

- `bol_sync_config` — `event_id` (FK events), `bol_event_id` (código na BOL), `organization_name`,
  `vault_secret_name` default `bol_master`, `enabled`, `last_run_at`, `last_run_status`.
- `bol_sync_runs` — espelho de `ticketline_sync_runs` (`status`, `mode`, `triggered_by`,
  `error_message`, `files_downloaded`, `import_audit`). RLS igual às tabelas Ticketline.
- Seed (Mundo Propício `7c858982-…`): `178134` → Deive Leonardo Lisboa,
  `178165` → Conferência de Mulheres Plenitude, `181437` → RG Santa Maria da Feira.

## Login (ASP.NET WebForms)

`/Utilizadores/Autenticacao.aspx?ReturnUrl=/Relatorios`. Cookie jar manual; o POST reenvia todos os
campos do form (`__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR`, selects) + os campos de
utilizador/password descobertos por sufixo (`…$UserName` / `…$Password`). Requer `User-Agent` de
browser (curl "nu" leva 403 do WAF). Sucesso = 302 ou cookie `.ASPXAUTH`/sessão.

## Página de mapas (URL real)

`https://produtores.bol.pt/Relatorios/MapasProdutor.aspx` (atrás do login). ASP.NET WebForms com
dropdown **Evento** (value = `bol_event_id`, ex. `178134`), checkbox "INCLUIR EVENTOS CONCLUÍDOS",
dropdown **Datas sessões** (usamos `*** TODAS EM VENDA ***`), radios TODAS / EM VENDA (default) /
REALIZADAS e botões de mapas: OCUPAÇÃO (M1 Local de Venda, **M2 Tipo de Venda**, M3 Tipo de Desconto
e Convite, Diário Vendas) e OUTROS (Acompanhamento de Pontos de Venda).

Fluxo em `fetch-bol-reports` (v1.4_mccb — RadMultiColumnComboBox):
O seletor de evento é um **Telerik.Web.UI.RadMultiColumnComboBox** (wrapper Kendo):
o input visível NÃO tem `name` e o hidden `ctl00_CPH_Body_telerikddlEvento_ClientState` vem SEM `value`
— não procurar por eles.
1. GET autenticado a `MapasProdutor.aspx` → hidden fields + parse do script `$create(Telerik.Web.UI.RadMultiColumnComboBox, …)`:
   - `readWidgetValue()` = primeiro `"value":"<digits>"` ANTES de `"itemsData"` (value atual do widget);
   - `readComboItems()` = pares `"text"/"value"` do `itemsData` (não é JSON estrito — tem `new Date(...)`).
   `value` dos itens == `bol_event_id` dos configs. Debug: `widget_value_initial`, `items_found`.
2. Se o `bol_event_id` não estiver nos itens → `event_not_in_list` (evento concluído; faltaria "Incluir Eventos Concluídos").
3. Se `widget_value_initial === bol_event_id` → seleção já feita, salta para o M2.
   Senão postback: `__EVENTTARGET="ctl00$CPH_Body$telerikddlEvento"`,
   `ctl00_CPH_Body_telerikddlEvento_ClientState = {"value","text","enabled":true}` (name com UNDERSCORES),
   `ctl00$CPH_Body$hfEventoFoiClear=""`.
   **Validação**: `readWidgetValue(resposta)` tem de ser === `bol_event_id`; senão `event_select_failed`
   com `widget_value_returned` + excerto do `$create`. NUNCA validar pelo texto
   "É necessário escolher um evento" (validator sempre presente, `display:none` — enganou a v1.2).
4. Postback do **M2**: `__EVENTTARGET="ctl00$CPH_Body$itm_MapaOcupacaoSessaoTipoVenda"`, mesmo ClientState,
   `hfEventoFoiClear=""`, `ctl00$CPH_Body$ddlSessao="0;0;01/01/0001;2"` (TODAS EM VENDA). Resposta: PDF direto,
   302 seguido, ou HTML com URL de PDF embutido. Nada disso → `map_postback_failed` com status, content-type e 800 chars.
5. **Dupla verificação no PDF**: `import_audit.debug.pdf_event_name` / `pdf_venue`; se nenhum token de 4+ letras
   do `organization_name` aparecer no PDF → `event_mismatch` (nunca importa evento errado).

A action `discover` devolve hiddenFields, selects+options, botões, `m2Button`, `telerikComboInput`,
`telerikClientState`, `telerikWidgetValue` e `telerikItems` de cada página.



## Relatório — M2 "Ocupação Sessões — Tipo de Venda"

Fonte escolhida (em vez do Mapa Diário) porque tem repartição por **SETOR**, permitindo importar
zonas reais como no Ticketline. Colunas (15 valores por linha, calibrado com Deive Leonardo,
Coliseu de Lisboa, 14/08/2026 — TOTAL 267 bilhetes / 11 634,00 €):

`Sector | Lotação Qt | Disp. Qt | Ocupação Qt | Taxa Ocup. % | Vendas Inteiras (Qt, Valor) |
Descontos (Qt, Valor) | Total Vendas (Qt, Valor) | Convites Qt | Permutas Qt | Reservas Geral Qt |
Reservas Produção Qt | Bloqueados Qt`

Parser `_shared/bol-report-parser.ts` → `parseBolM2(text)`:
- opera sobre o stream de tokens (ordem do unpdf pode variar), ancorado em **blocos de 15 valores**;
- resolve a ambiguidade dos milhares ("60 3 600,00 €" vs "17 816,00 €") por busca das combinações
  possíveis, escolhendo a que dá 15 valores com monetários em 5/7/9 e `Total = Inteiras + Descontos`;
- nomes de setor podem conter números ("Camarotes 1ª Frente Par 6 pax") e vir de várias linhas;
- `TOTAL` só é reconhecido quando é o último token antes dos números (o cabeçalho tem "Total Vendas");
- valida soma dos setores vs linha TOTAL (warnings) e o import falha se não bater.
- Harness: `src/test/bol-m2-parser.test.ts` com o dump real (6 testes).

## Import (`_shared/bol-import-server.ts`)

- **Uma zona por setor** (`event_ticket_zones`, `session_id=null`, `total_capacity` = Lotação Qt,
  atualizada se mudar) + lote `Lote 1` por zona (IVA 6%, `quantity` = lotação).
- `quantity` = Total Vendas Qt, `total_value` = Total Vendas Valor, `unit_price` = total/qty.
- `sale_date` = data de geração do relatório (timestamp `DD|MM|AAAA`) ou hoje — o M2 é cumulativo.
- Setores sem vendas: zona criada/atualizada, sem linha em `ticket_sales` (critério Ticketline).
- Conta financeira `ticket_office` com "BOL" no nome (criada como "Bilheteira BOL") + assignment
  com `event_date_id=null`.
- Full-replace de `source='bol'` por evento+conta, novo `import_batch_id`.
- **Bloqueante**: sem linha TOTAL ou divergência > 0,02 € / 1 bilhete → run falha (`import_failed`).

## Estados de erro

`creds_missing` ("Credenciais em falta no Vault (bol_master)"), `creds_invalid`, `login_get`,
`login_form`, `login_viewstate`, `login_post`, `session_expired` (retriable),
`event_not_in_list`, `event_select_failed`, `map_postback_failed`, `event_mismatch`, `html_response`, `pdf_text_failed`,
`parse_failed`, `import_failed`, `account_missing`, `fanout_*`.

## UI e cron

- `/admin/bol-sync` (admin): lista configs com último estado, Sincronizar por evento, Adicionar
  evento (evento ERP + `bol_event_id`, credenciais `bol_master` por defeito), botão Credenciais e
  **Testar ligação** (`action:"discover"` — faz login e inventaria MapasProdutor.aspx: hidden fields,
  selects+options, botões e `m2Button`).
- Cron `bol-sync-daily` às **23:20 UTC** (`scripts/cron-bol-sync-daily-live.txt`), service role do
  Vault `email_queue_service_role_key`, body `{"mode":"cron"}`.

## v1.6_daily_series — série diária (2026-08-15)
- Depois do M2, o mesmo run faz um SEGUNDO postback na mesma sessão ao botão
  "Diário Vendas" (`ctl00$CPH_Body$itm_MapaDiarioVendasSessao`) e importa o
  "Mapa Diário de Vendas por Sessão" para `bol_daily_sales` (full-replace por
  `event_id`, validado contra a linha TOTAL do PDF).
- Parser recuperado da v1.0 e isolado em `_shared/bol-daily-parser.ts`
  (`parseBolDiario` + `importBolDailySeries`). O parser M2 não foi tocado.
- Falha do Diário NÃO falha o run: status fica `warning` e o motivo vai para
  `error_message`; `import_audit` ganha `daily_rows`, `daily_total_qty`,
  `daily_total_value`, `daily_debug`.
- Motivo: o M2 é cumulativo (snapshot), logo "ontem"/"últimos 7 dias" não saem
  do `ticket_sales` para eventos BOL — saem de `bol_daily_sales`.
- Consumidor: RPC `get_sales_position()` + widget "Posição de Vendas" no
  Dashboard (agrega subeventos no evento-mãe; nunca soma ticket_sales com
  bol_daily_sales na mesma métrica).
