---
name: VIP coupon email
description: E-mail do cupom VIP (imediato via trigger em lead_capture + lembrete D-3 por cron 08:30 UTC), idempotência em vip_coupon_email_log, base URL por app_secrets
type: feature
---

Entrega o cupom (`events.vip_coupon_code/_discount_label/_valid_until`) por e-mail
a quem se cadastra VIP no portal (`lead_capture.source LIKE 'vip%'` + `consent_email`).

- Edge fn `vip-coupon-email` com modos `immediate` | `reminder` e `dryRun`.
- Cupom ativo = código não vazio E `vip_coupon_valid_until >= hoje`.
- Lembrete: eventos que expiram **exatamente daqui a 3 dias**, só a quem já
  recebeu `immediate` e ainda não recebeu `reminder`.
- Idempotência: `vip_coupon_email_log` unique(event_id,email,type); linha
  inserida antes do envio e removida se o envio falhar.
- Envio pela infra existente `send-transactional-email` (template `vip-coupon`).
- URL das functions vem de `app_secrets.project_functions_base_url` (nunca
  hardcoded) — Publish não propaga DML nem crons: em Live é preciso inserir a
  chave e agendar `vip-coupon-reminder-daily` no SQL Editor.
- **Testes só com `dryRun: true`** — nunca inserir leads reais nem enviar e-mail.

Doc: `docs/features/vip-coupon-email.md`
