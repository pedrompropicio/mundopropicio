---
name: Coala convite Early Bird 2027
description: Convite token aos compradores 2026, lista coala_list_members, consentimento de marketing separado, alerta de abertura 3/11; fonte coala_early_bird_invite sem emails nem conversões
type: feature
---

D-ERP276. Três estados por email (empresa Coala): convidado (`coala_invites`), na lista (`coala_list_members`), marketing (`coala_list_consents`, append-only, 'eb2027-v1', 'token_email').

- "Na lista" = vista `coala_list_members` (lead_capture Coala com email, exceto `diag_test`, ∪ convites confirmados). Usar SEMPRE esta vista; nunca filtrar por fonte.
- `confirmar_lista(token, marketing_opt_in, locale)` pública e idempotente; fonte `coala_early_bird_invite`.
- Essa fonte NUNCA gera email (`trg_coala_lead_confirm` WHEN) nem conversão (`process_lead_captures_batch` salta antes de `leads`).
- `coala_send_eb_invite_batch` / `coala_send_eb_open_alert`: dry run por defeito, sem escrita; `p_daily_cap` obrigatório no envio; `p_only_emails` para testes; só service_role.
- Idioma: fever `Pt` → PT, resto → EN.
- Qualquer marketing Coala filtra pelo último `marketing_opt_in` (fallback `consent_email`).
- Proibido envio real sem ordem do Pedro; testes só dry run ou endereços internos indicados por ele.
