---
name: multi-tenant-edge-functions-audit
description: Status do hardening multi-tenant das 24 edge functions com service_role
type: feature
---

# Multi-tenant Edge Functions — Audit & Hardening

Helper partilhado: `supabase/functions/_shared/multiTenant.ts` (`authenticateAndResolveCompany`, `assertResourceCompany`, `withCompanyId`).

## ✅ Hardened (7)
- `update-transaction`, `approve-transaction`, `close-camarim-session`, `generate-historical-transactions` — validam company da transação
- `create-user` — força profile + role na company do creator
- `delete-user` — bloqueia delete cross-tenant (platform_admin bypassa)
- `resend-reset-email` — bloqueia reenvio cross-tenant

## ✅ Já seguras por design (8)
- `accept-invitation` — força company do convite (já usa company_id do token)
- `invite-company-admin`, `create-company` — só platform_admin
- `audit-categories`, `match-categories`, `extract-invoice-total`, `extract-camarim-receipt`, `extract-ticket-pdf` — só proxy para AI Gateway, não tocam DB; `verify_jwt = true` (default) bloqueia anónimos
- `check-login-rate` — tabela global `login_attempts` (intencional)
- `request-password-reset` — `verify_jwt = false` por design (recovery flow); usa rate-limit interno

## ⏭️ Backups (4) — Bloco B (próximo passo)
- `database-backup` — atualmente global; precisa loop por company OU snapshot por company_id
- `database-restore`, `selective-restore`, `surgical-restore` — precisam validar que o ficheiro pertence à company do caller

## Tabelas globais (não tenant-scoped)
`cities`, `companies`, `role_permissions`, `login_attempts`, `mfa_*`, `email_unsubscribe_tokens`

## Verificação
- `test-multi-tenant-isolation` (RLS): 7/7 ✅
- Próximo: testes para `delete-user` cross-tenant + backup cross-tenant
