---
name: Ticketline sync — conta única e cache de sessão
description: Modelo de credenciais único (ticketline_master), 1 login Devise por corrida, cron 22:59 UTC funcional desde v2.6, semântica de runs html_response
type: feature
---

## Credenciais — conta única

- Existe **uma só** conta Ticketline Manager. O segredo Vault canónico é
  `ticketline_master` (JSON `{email,password}`). Os 5 segredos `ticketline_*`
  antigos eram byte a byte idênticos; os 13 registos de
  `ticketline_sync_config` apontam todos para `ticketline_master` (2026-08-11).
- Ligar um evento novo ao sync exige apenas: **evento do ERP +
  `ticketline_event_id`** (+ data de início de vendas, opcional). A UI
  `/admin/ticketline-sync` → botão **Adicionar evento** assume
  `vault_secret_name='ticketline_master'` por defeito; só pede email/password
  se o utilizador ligar o toggle "Usar outra conta" (aí grava
  `ticketline_<event_id>` via `update-ticketline-credentials`).

## Cache de sessão (v2.7)

`fetch-ticketline-reports` mantém um `Map<vault_secret_name, Jar>` por
invocação: faz login Devise **uma vez** no primeiro config que usa esse
segredo e reutiliza o cookie jar nos seguintes. Uma corrida do cron = 1 login
para os 13 configs (antes eram 13). Self-heal mantido: falha `session_expired`
(retriable) → re-login, actualiza o cache, repete uma vez. Parser e import
inalterados.

## Cron

Job `ticketline-sync-daily` às **22:59 UTC** (23:59 PT verão). Nunca correu
até 2026-08-11: a função só aceitava `token === SERVICE_ROLE` (env) e o cron
manda o service role JWT do Vault. Corrigido na **v2.6** com o helper
`jwtRole()` (mesmo padrão da `sync-coala-from-drive`).

## Semântica de erros

- `html_response` — a Ticketline devolveu HTML (200) em vez do XLSX e **não é
  sessão**: significa `ticketline_event_id` obsoleto ou conta sem acesso a
  esse evento. Não retriable (sem re-login inútil); o `error_message` inclui
  `<title>` + trecho. Usar `{"action":"discover"}` para listar os IDs reais
  visíveis pela conta e corrigir os configs.
- `session_expired` — só quando o HTML é a página de `sign_in`; aí sim retriable.
