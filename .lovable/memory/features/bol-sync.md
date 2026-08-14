---
name: BOL sync (produtores.bol.pt)
description: Sync diária do Mapa Diário de Vendas por Sessão da BOL para ticket_sales (zona única "BOL"), no molde da fetch-ticketline-reports v2.8
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

## Relatório

**Mapa Diário de Vendas por Sessão** (PDF, texto extraível). Formato calibrado com exemplo real de
**14/08/2026** (Deive Leonardo, Coliseu de Lisboa; TOTAL 267 bilhetes / 11 634,00 €):
cabeçalho `Data | Bilhetes | Vendas Inteiras (Bilheteira Local, Ponto de Venda, Internet) |
Vendas Desconto (idem) | TOTAL`; linha por dia com data `DD/MM/YYYY`, quantidade e 7 valores em
formato pt (`1 184,00 €`); linha final `TOTAL`; rodapé com evento, sala,
"Todas as sessões (Em Venda)" e www.bol.pt. Pode ter 2+ páginas.

Parser `_shared/bol-report-parser.ts` é **tolerante por linha**: extrai data + primeiro inteiro
solto (bilhetes) + todos os valores monetários, sendo o último o TOTAL do dia. Valida a soma das
linhas contra a linha TOTAL (divergência = warning no `import_audit`, não falha). Texto do PDF via
`unpdf` (esm.sh).

## Import (`_shared/bol-import-server.ts`)

- Zona única **"BOL"** por evento (`event_ticket_zones`, `session_id=null`) + lote `Lote 1`
  (ensure, IVA 6%).
- Conta financeira `type='ticket_office'` com "BOL" no nome; criada como **"Bilheteira BOL"** se
  faltar; assignment ao evento com `event_date_id=null`.
- `ticket_sales` `source='bol'`: **substituição completa por sync** (apaga tudo desse evento +
  conta + source e reinsere com novo `import_batch_id`). `quantity` = Bilhetes,
  `total_value` = TOTAL do dia, `unit_price = total/qty` (2 casas).
- Auditoria em `bol_sync_runs.import_audit` + `ticket_import_logs`.
- Vendas detetadas mas 0 linhas importadas → run `warning` (nunca sucesso silencioso).

## Estados de erro

`creds_missing` ("Credenciais em falta no Vault (bol_master)"), `creds_invalid`, `login_get`,
`login_form`, `login_viewstate`, `login_post`, `session_expired` (retriable),
`html_response` (relatório não encontrado nos caminhos conhecidos), `pdf_text_failed`,
`parse_failed`, `import_failed`, `account_missing`, `fanout_*`.

## UI e cron

- `/admin/bol-sync` (admin): lista configs com último estado, Sincronizar por evento, Adicionar
  evento (evento ERP + `bol_event_id`, credenciais `bol_master` por defeito), botão Credenciais e
  **Testar ligação** (`action:"discover"` — faz login e inventaria páginas/links/forms/selects e
  IDs de evento vistos, para calibrar o URL do mapa).
- Cron `bol-sync-daily` às **23:20 UTC** (`scripts/cron-bol-sync-daily-live.txt`), service role do
  Vault `email_queue_service_role_key`, body `{"mode":"cron"}`.

## PENDENTE DE CALIBRAÇÃO

O caminho exato do Mapa Diário é atrás de login, logo não foi confirmável sem credenciais. A função
sonda candidatos (`/Relatorios/MapaDiarioVendasSessao?evento=…&formato=pdf` e variantes) e, se
nenhum devolver PDF, falha com `html_response` + lista `import_audit.debug.map_tried`. Assim que o
Pedro gravar as credenciais: correr **Testar ligação** e usar os `mapLinks` devolvidos para fixar o
URL/POST real em `mapCandidates()`.
