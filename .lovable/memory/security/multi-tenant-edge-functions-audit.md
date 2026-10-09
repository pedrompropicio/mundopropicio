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

## #283 parte 3 (08/10/2026)
- Corrigidos: probe-fever-login apagada; credenciais Fever/Ticketline/BOL/B2B/refresh/coala-bootstrap com assertCallerRoleOnRow
  (papel verificado NA empresa da linha). SECDEF de BP/CRM/artistas com invólucro `_assert_row_company` (migração 0040).
- Invariantes diários: politicas_sem_predicado_empresa (6) e secdef_sem_guarda_empresa (12).
- ABERTOS SEM AUTENTICAÇÃO (por decidir pelo Pedro): tmp-fever-reimport (ESCRITA em qualquer evento), restore-debug (lê
  qualquer backup), crm-meta-peek-video-ids (usa o token Meta de qualquer empresa), fetch-fever-reports (dispara sync de
  qualquer config), probe-onebox-login e probe-ticketline-produtores (login com os segredos do fornecedor).
- Só-admin ficam como estão até haver 2.º admin (D-ERP195).

## Parte 4 (08/10/2026, D-ERP196)
- Apagadas: tmp-fever-reimport, restore-debug, probe-onebox-login.
- Só service_role: crm-meta-peek-video-ids, fetch-fever-reports (molde portal-media-import).
- lead_capture: company_id preenchido por trigger na inserção; backfill feito. recalculate_pax_benchmarks presa à empresa activa.
- Parte 5 feita (09/10/2026, D-ERP203) — ver secção abaixo.

## Parte 5 (09/10/2026, D-ERP203) — lista nominal das 29
Molde: `isServiceRoleRequest` (service role exacta ou verificada no Auth — o payload sozinho forja-se), `assertCallerRoleInCompany` (company_id do corpo = activa + papel nessa empresa), `assertCallerRoleOnRow` (id → empresa da linha). getUser obrigatório; a anon key é pública.

Corrigidas (8, porta aberta: anon key bastava):
- crm-meta-create-purchase-audience (empresa do evento), crm-meta-create-lookalike, crm-meta-create-website-audience, crm-meta-upload-creative, crm-meta-upload-creative-v2, crm-meta-list-audiences, crm-google-sync-campaigns, crm-google-video-metrics-sync.

Limpas (17):
- Linha vs company_id + papel na empresa da linha: crm-meta-publish-update, crm-meta-publish-activate, crm-google-video-publish-execute, crm-google-video-publish-activate.
- RLS da sessão (políticas `company_id = current_company_id()` confirmadas em crm.google_publish_plan, crm.ad_platform_connections, crm.ad_platform_account_links, crm.meta_creatives, crm.meta_campaign_snapshot, public.meta_custom_audiences) ou empresa activa: crm-meta-publish-prepare, crm-google-publish-activate, crm-google-publish-execute, crm-google-publish-lookups, crm-meta-campaign-from-scratch, crm-meta-campaign-redesign, crm-meta-create-reels-ad (só grava linha de debug antes da RLS), crm-meta-audience-sync, crm-meta-sync-creatives (token via RPC com a sessão; RPC filtra pela empresa activa).
- Empresa resolvida no servidor: crm-meta-audience-upload.
- crm-google-ads-sync: corrigida para admin NA empresa fixa (era has_role em qualquer empresa).
- crm-meta-publish-execute: limpa para utilizadores; o ramo service role confia no payload do JWT com verify_jwt=false (por decidir, ver abaixo).

Por desenho / só-admin (4, sem mexer):
- crm-google-click-ingest — sinal do portal, empresa fixa, sem auth.
- crm-google-conversion-upload, crm-google-customer-match-sync, crm-google-user-list-ensure — admin em qualquer empresa age na MP (user-list-ensure aceita user_list_id sem filtro): D-ERP195.

Também: sync-coala-from-drive (papel na empresa da config + service role verificada); probe-ticketline-produtores apagada; `authenticateAndResolveCompany` usa `getUser(jwt)`.

Por decidir (achado da prova): service role pelo payload sem assinatura e verify_jwt=false em apply-coala-bp, coala-sync-bootstrap, bilheteira-sync, fetch-ticketline-reports, fetch-bol-reports, crm-meta-publish-execute. Correcção = trocar por `isServiceRoleRequest`.
