---
name: BOL sync (produtores.bol.pt)
description: Sync diária do mapa M2 "Tipo de Venda" da BOL (MapasProdutor.aspx) para ticket_sales com uma zona por setor, no molde da fetch-ticketline-reports v2.8
type: feature
---

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

Fluxo em `fetch-bol-reports` (v1.1):
1. GET autenticado a `MapasProdutor.aspx` → `parseFormFields` (hidden `__VIEWSTATE`,
   `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`) + `parseSelects`.
2. Postback de **seleção do evento** (`__EVENTTARGET` = nome do select, AutoPostBack) → novo VIEWSTATE.
3. Postback do **botão M2** (procurado por `value`/`name` com "M2" ou "tipo de venda"), com o select
   de sessões em "TODAS EM VENDA" → PDF direto ou via 302 (seguido).
Falha de qualquer passo → `html_response` com `describeHtml` + `import_audit.debug`
(`maps_selects`, `maps_event_options`, `maps_buttons`, `map_tried`). A action `discover` devolve
hiddenFields, selects+options, botões e `m2Button` de cada página.

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
`html_response` (relatório não encontrado nos caminhos conhecidos), `pdf_text_failed`,
`parse_failed`, `import_failed`, `account_missing`, `fanout_*`.

## UI e cron

- `/admin/bol-sync` (admin): lista configs com último estado, Sincronizar por evento, Adicionar
  evento (evento ERP + `bol_event_id`, credenciais `bol_master` por defeito), botão Credenciais e
  **Testar ligação** (`action:"discover"` — faz login e inventaria MapasProdutor.aspx: hidden fields,
  selects+options, botões e `m2Button`).
- Cron `bol-sync-daily` às **23:20 UTC** (`scripts/cron-bol-sync-daily-live.txt`), service role do
  Vault `email_queue_service_role_key`, body `{"mode":"cron"}`.
