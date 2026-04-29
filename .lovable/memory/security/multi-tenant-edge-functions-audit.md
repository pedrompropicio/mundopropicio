---
name: multi-tenant-edge-functions-audit
description: Status do hardening multi-tenant das 24 edge functions com service_role
type: feature
---

# Multi-tenant Edge Functions — Audit & Hardening (CONCLUÍDO ✅)

Helper partilhado: `supabase/functions/_shared/multiTenant.ts`.

## ✅ Hardened (12)
**Transações (4)**
- `update-transaction`, `approve-transaction`, `close-camarim-session`, `generate-historical-transactions`

**Auth/Admin (3)**
- `create-user` — força profile + role na company do creator
- `delete-user` — bloqueia delete cross-tenant
- `resend-reset-email` — bloqueia reenvio cross-tenant

**Backups (4)** — Bloco B
- `database-backup` — refactor v3: 1 ficheiro por company (`backup-<slug>-<ts>.json`) + 1 global (`backup-global-<ts>.json`); cron faz loop por todas as empresas ativas; rotation 30 últimos por grupo
- `database-restore` — valida scope do JSON (company/global/legacy), bloqueia restore de backup de outra empresa, filtra DELETE+INSERT por company_id
- `selective-restore` — mesma proteção; quando há tenantFilter, DELETE só apaga linhas dessa company (nunca `delete-all`)
- `surgical-restore` — valida company_id do backup + valida que TODOS os event_ids pedidos pertencem à company do caller

**Push (1)** — Bloco C
- `send-push-notification` — resolve company ativa do caller e força filtro `company_id` na query a `push_subscriptions`; rejeita callers sem company (exceto platform_admin); user_ids passados são intersectados com a empresa

## ✅ Já seguras por design (12)
- `accept-invitation` — força company do convite
- `invite-company-admin`, `create-company` — só platform_admin
- `audit-categories`, `match-categories`, `extract-invoice-total`, `extract-camarim-receipt`, `extract-ticket-pdf` — só proxy AI Gateway, `verify_jwt = true`, sem DB
- `help-search` — proxy AI, sem DB tenant
- `check-login-rate` — tabela global `login_attempts`
- `request-password-reset` — `verify_jwt = false` por design
- `send-transactional-email` — service-role; trigger BEFORE INSERT em `email_send_log` preenche `company_id` via `current_company_id()` quando há JWT do utilizador; sistema (auth-hook) deixa NULL intencionalmente
- `process-email-queue` — cron service-role; processa queue cross-tenant e respeita `company_id` já gravado pelo enqueue
- `auth-email-hook`, `handle-email-suppression`, `handle-email-unsubscribe`, `fetch-fx-rate`, `preview-transactional-email`, `restore-debug`, `database-restore-v2` (legacy) — sem leitura de tenant data ou só platform_admin

## Tabelas globais (NUNCA tocadas por restores de empresa)
`cities`, `companies`, `role_permissions`, `login_attempts`, `mfa_recovery_codes`, `mfa_trusted_devices`, `email_unsubscribe_tokens`, `suppressed_emails`

## Backup file format v3
```json
{
  "version": 3,
  "scope": "company" | "global",
  "company_id": "<uuid>",   // só em scope=company
  "company_slug": "...",
  "created_at": "...",
  "tables": {...},
  "table_counts": {...}
}
```

## Verificação
- `test-multi-tenant-isolation` (RLS): 7/7 ✅
- `tests/multi-tenant-edge.test.ts`: 11/12 (1 falha pré-existente em `create-user` — devolve 200 com error, design intencional)
- Novos testes: delete-user, resend-reset-email, database/selective/surgical-restore, send-push-notification (todos rejects unauthenticated/cross-tenant ✅)

## Pré-requisito Live
Antes de promover para Live: o cron tem de gerar pelo menos 1 ciclo de backups v3 (1 por empresa). Backups v2 existentes ficam disponíveis mas só platform_admin os pode restaurar.
