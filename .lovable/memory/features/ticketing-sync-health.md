---
name: Saúde do sync de bilheteira
description: check_ticketing_sync_health() — 4 condições (a/b/c/d), canais system_reminders + email ticketing-sync-alert, anti-spam 12h e cron ticketing-sync-health
type: feature
---

# Saúde do sync de bilheteira (Ticketline + BOL)

Criado a 18/09/2026 em resposta às issues #145 e #184(c): a bilheteira parou três
vezes em duas semanas (Ticketline 37 corridas `html_response`, BOL 42
`import_failed`, 5 configs desligadas em bloco a 28/08) sem que ninguém fosse
avisado. O mecanismo antigo (`notify_sync_action_needed()`) aponta em Live para o
projeto de TEST e o trigger dele sobre `ticketline_sync_runs` é um no-op — **não
mexer nele, é a issue #211**.

## Motor

`public.check_ticketing_sync_health()` — plpgsql, SECURITY DEFINER,
`SET search_path = public`, EXECUTE revogado a PUBLIC/anon/authenticated e
concedido só a `service_role`. Corre por **SQL direto** no cron
`ticketing-sync-health` (`45 * * * *`, jobid 217 em Live), depois das capturas
(Ticketline :05 e :15, BOL :25).

Universo: configs de `ticketline_sync_config` e `bol_sync_config` cujo evento tem
`events.date >= current_date`.

## As quatro condições

| Cond. | Regra | Email? |
| --- | --- | --- |
| (a) falha persistente | config `enabled` cujas 3 corridas mais recentes (por `started_at desc`) estão todas fora de `('success','warning','skipped')` | sim |
| (b) parado | config `enabled` sem corrida `success`/`warning` nas últimas 6 h | sim |
| (c) desligado | config `enabled = false` (informativo) | **não** — só banner |
| (d) captura horária parada | existe config Ticketline `enabled` de evento futuro e nenhuma corrida `triggered_by like 'capture_day:%'` com `success` nas últimas 3 h | sim |

`warning` conta como **saudável** (na BOL é o M2 importado com o Diário falhado).
`skipped` não alarma mas também não repõe o relógio de (b). Por config reporta-se
uma condição (prioridade c → a → b).

## Canais, por esta ordem

1. **`system_reminders`** (chave `ticketing_sync_stalled`): upsert com título curto
   e mensagem por linha `evento · bilheteira · condição · último sucesso · erro`;
   `is_active = false` + `completed_at` quando tudo recupera — o aviso apaga-se
   sozinho, no molde de `check_leads_capi_health()`.
2. **Email** por `net.http_post` a
   `https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/send-transactional-email`
   (**este projeto — foi o URL errado que matou o alerta anterior**), Authorization
   com o service role do vault `email_queue_service_role_key`, template
   `ticketing-sync-alert`, `templateData = { runAt, itens: [{evento, bilheteira,
   condicao, detalhe, desdeQuando}] }`.

O registo vem primeiro de propósito: uma falha de email nunca apaga o aviso.

## Destinatários e anti-spam

- admin/manager/platform_admin via `user_roles` + `profiles.email`; se não resolver
  nenhum, recorre ao secret `BILHETEIRA_SYNC_NOTIFY_CC`. Sem secrets novos.
- Máximo 1 email por config a cada 12 h via `sync_notifications_sent`
  (`UNIQUE (config_id, sync_type)`, **sem FK** em `config_id`). `sync_type` é
  `ticketline_health` / `bol_health`; para a condição (d) usa-se
  `config_id = d7f4efc8-ab89-4357-a9ee-113eb28d8e7c` com
  `sync_type = 'ticketline_capture'`.

## Sem EXCEPTION mudo

Só o bloco de envio de email tem `EXCEPTION WHEN OTHERS`, e esse **não é mudo**:
`RAISE WARNING` com detalhe + linha em `system_audit_log`
(`entity_type = 'ticketing_sync_health'`, `action = 'email_failed'`). Foi um
`EXCEPTION` mudo que escondeu a falha anterior durante quatro meses.

## Prova inicial (Live, 18/09/2026 15:55)

`select public.check_ticketing_sync_health();` devolveu `items: []`,
`emails_sent: 0`, `reminder_active: false` — as 4 configs BOL e as 13 Ticketline de
eventos futuros estavam a sincronizar. Nenhuma linha em `email_send_log` nem em
`system_audit_log`.
