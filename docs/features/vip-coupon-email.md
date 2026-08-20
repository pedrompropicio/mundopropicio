# E-mails do cupom VIP

Entrega por e-mail do cupom de desconto que o portal público revela a quem se
registou como VIP, mais um lembrete 3 dias antes de expirar. Genérico: funciona
para qualquer evento com cupom (arrancou com a campanha Ivete Clareou).

## Peças

| Peça | Caminho |
| --- | --- |
| Edge function | `supabase/functions/vip-coupon-email/index.ts` |
| Template React Email | `supabase/functions/_shared/transactional-email-templates/vip-coupon.tsx` (registado em `registry.ts` como `vip-coupon`) |
| Log/idempotência | tabela `public.vip_coupon_email_log` |
| Trigger | `vip_coupon_email_after_insert` em `public.lead_capture` |
| Cron | `vip-coupon-reminder-daily` — 08:30 UTC → `public.run_vip_coupon_reminder()` |
| Base URL do ambiente | `public.app_secrets` chave `project_functions_base_url` |

O envio reutiliza a infra existente: `send-transactional-email` (mesmo
`from`/`SENDER_DOMAIN`, supressão de bounces e fila). Não há novo secret.

## Dados de origem

- `events.vip_coupon_code`, `events.vip_coupon_discount_label`,
  `events.vip_coupon_valid_until`, `events.ticketing_url`, `events.name`.
- **Cupom ativo** = código não vazio **E** `vip_coupon_valid_until >= hoje`.
- `lead_capture`: `email`, `name`, `consent_email`, `event_slug`, `source`.

## Fluxo

### 1. Imediato

```
insert em lead_capture (source LIKE 'vip%')
  → trigger AFTER INSERT
    → net.http_post  <base_url>/functions/v1/vip-coupon-email?mode=immediate
       Authorization: Bearer <vault: email_queue_service_role_key>
       body { mode: 'immediate', lead_id }
      → resolve lead → evento por event_slug
      → valida email + consent_email + cupom ativo
      → grava vip_coupon_email_log (type='immediate')
      → send-transactional-email (template 'vip-coupon')
```

Alternativa de chamada manual: `{ mode:'immediate', email, event_id }`.

O e-mail traz nome do evento, rótulo do desconto, o **código em destaque**,
validade em DD/MM/AAAA e botão "Comprar bilhete" para `events.ticketing_url`
(o botão é omitido se não houver URL).

### 2. Lembrete

Cron diário 08:30 UTC → `mode=reminder`:

1. Seleciona eventos cujo `vip_coupon_valid_until` cai **exatamente daqui a 3
   dias** e cujo cupom está ativo.
2. Para cada um, lista quem tem log `immediate` e ainda não tem log `reminder`.
3. Envia o mesmo template com `isReminder: true` — copy de urgência
   ("o teu cupom expira a DD/MM") e a nota "se já garantiste o teu bilhete,
   ignora este e-mail" (não sabemos quem comprou).

### 3. Idempotência

`vip_coupon_email_log` tem `unique(event_id, email, type)`. A linha é inserida
**antes** do envio; se o envio falhar, a linha é removida para permitir nova
tentativa. Violação de unicidade devolve `status: 'already_sent'` — nunca dois
e-mails do mesmo tipo para o mesmo email+evento.

### 4. dryRun

`{ "dryRun": true }` (ou `?dryRun=true`) em qualquer modo: apenas escreve nos
logs o que enviaria. Não grava no log de idempotência e não envia nada.
**Todos os testes desta feature devem usar `dryRun: true`** — nunca inserir
leads reais nem enviar e-mail em teste (regra pós-incidente).

## Segurança

- `vip_coupon_email_log`: RLS ativa e **sem policies**; só `service_role`
  (edge function) escreve/lê. Sem GRANT a `anon`/`authenticated`.
- `vip-coupon-email` com `verify_jwt = true` — só é chamada pela BD com a
  service_role key do Vault.
- `vip_coupon_functions_base_url()` e `run_vip_coupon_reminder()` com EXECUTE
  revogado a `PUBLIC`/`anon`/`authenticated`.

## Multi-ambiente

O URL das edge functions **não** está hardcoded na função da BD: vem de
`public.app_secrets.project_functions_base_url`. Assim a mesma DDL serve Test e
Live e o Publish (diff pg_dump) não pode arrastar o URL do ambiente errado.
Se a chave faltar, o trigger/cron apenas emite `WARNING` e não dispara nada
(fail-safe).

## Pendente do Publish do Pedro

1. **Publish** para propagar a DDL (tabela `vip_coupon_email_log`, funções
   `vip_coupon_functions_base_url`, `trg_vip_coupon_email_immediate`,
   `run_vip_coupon_reminder` e o trigger em `lead_capture`).
2. **DML em Live (SQL Editor, permitido)** — a chave de ambiente, porque o
   Publish não propaga dados:

```sql
insert into public.app_secrets (name, value, description)
values ('project_functions_base_url',
        'https://<ref-do-projeto-live>.supabase.co',
        'Base URL das edge functions deste ambiente (usada por triggers/crons).')
on conflict (name) do update set value = excluded.value, updated_at = now();
```

3. **Cron em Live (SQL Editor)** — `cron.job` não viaja no pg_dump:

```sql
select cron.unschedule('vip-coupon-reminder-daily')
where exists (select 1 from cron.job where jobname = 'vip-coupon-reminder-daily');

select cron.schedule('vip-coupon-reminder-daily', '30 8 * * *',
  $$select public.run_vip_coupon_reminder();$$);
```

4. **Confirmar em Live** que o Vault tem `email_queue_service_role_key` (já
   usado por outros crons) e que o evento da campanha tem
   `vip_coupon_code` + `vip_coupon_valid_until` preenchidos — sem isso a função
   devolve `skipped: evento sem cupom ativo`.
