
# Hardening `verify_jwt` — 5 edge functions sensíveis

## TL;DR

As 5 funções podem migrar para `verify_jwt = true` **sem ajuste em nenhum caller**. Todos os callers (frontend admin via `supabase.functions.invoke`, cron via anon key, inter-função via service_role) já enviam JWT válido. **Bonus:** descobri 1 finding extra (`preview-transactional-email`) e 1 caller órfão (`surgical-restore` sem frontend).

---

## Mapeamento por função

### 1. `database-backup` → ✅ migrar para `true`

- **Guards internos:** distingue `service_role` vs admin via JWT claims; cron passa anon mas a função aceita porque também tem Lisbon 03:00 gate + admin role check fallback.
- **Callers:**
  - Frontend: `src/pages/DatabaseBackups.tsx:100` via `supabase.functions.invoke("database-backup")` → JWT autenticated automático ✅
  - Cron Test: `daily-database-backup-summer` (02:00 UTC) e `daily-database-backup-winter` (03:00 UTC) — ambos enviam **anon JWT** no header `Authorization: Bearer <anon>` ✅
  - Cron Live: `daily-database-backup` (03:00 UTC) — também anon ✅
- **Inter-função:** nenhuma.
- **Decisão:** migrar. Anon JWT passa o gateway com `verify_jwt=true`.

### 2. `database-restore` → ✅ migrar para `true`

- **Guards:** admin role obrigatório (decoded do JWT); cross-tenant block.
- **Callers:** apenas `src/pages/DatabaseBackups.tsx:150,169` (frontend admin) ✅
- **Cron:** nenhum.
- **Decisão:** migrar trivial.

### 3. `selective-restore` → ✅ migrar para `true`

- **Guards:** admin only + cross-tenant block (linha 309).
- **Callers:** apenas `src/components/SelectiveRestoreModal.tsx:105,126` ✅
- **Decisão:** migrar trivial.

### 4. `surgical-restore` → ✅ migrar para `true` (com nota)

- **Guards:** admin only via JWT; cross-tenant block; valida que cada `event_id` pertence à company do caller.
- **Callers frontend:** **nenhum encontrado** (`rg "surgical-restore" src/` retorna 0). Função existe mas não está plugada em UI — provavelmente chamada manualmente via `supabase.functions.invoke` em consola admin, ou órfã.
- **Decisão:** migrar (não há regressão possível) **e** sinalizar à parte se é para remover ou plugar em UI.

### 5. `send-push-notification` → ✅ migrar para `true`

- **Guards:** exige `Authorization: Bearer <jwt>`, valida via `auth.getUser()`, resolve `company_id` do caller, filtra subscriptions por tenant.
- **Callers:**
  - Frontend: `src/lib/push-notifications.ts:120` via `supabase.functions.invoke` ✅ (passa JWT autenticated)
  - Inter-função: nenhuma (verificado com `rg` em `supabase/functions/`).
  - Postgres triggers / `pg_net`: **nenhum** — não encontrei chamadas via cron nem via trigger DB.
- **Decisão:** migrar. **Nota:** se no futuro adicionares disparo via Postgres trigger, terás de seguir o pattern do `process-email-queue` (service_role do Vault).

---

## Achados paralelos

### A. `preview-transactional-email` — manter `false` ✅ (era dúvida tua)

- Está intencionalmente `verify_jwt=false` porque **só o backend Go (Lovable) chama**, autenticando via header `Authorization: Bearer <LOVABLE_API_KEY>`. Não é JWT do Supabase. Se ligares `verify_jwt=true`, **quebras** — o gateway exige JWT do projeto, não LOVABLE_API_KEY.
- **Decisão:** documentar no comentário do `config.toml` para evitar futura "limpeza" errada.

### B. Cron `daily-database-backup-*` usa anon key (Test e Live)

- Funciona com `verify_jwt=true` (anon JWT é válido). Mas é defesa em profundidade fraca: se o anon key vazar em qualquer cliente público, qualquer pessoa pode disparar a função (que ainda é gated pelo guard interno admin/Lisbon, mas...).
- **Recomendação opcional, não-blocker desta volta:** migrar os 3 crons para o pattern do `process-email-queue` — guardar service_role no Vault (`vault.create_secret('database_backup_service_role_key', ...)`) e ler em `cron.schedule` via `vault.decrypted_secrets`. Agendar como item separado.

### C. `surgical-restore` órfã na UI

- Sinalizar em backlog: ou plugar num `SurgicalRestoreModal` (similar ao `SelectiveRestoreModal`) ou remover. Não toca neste plano.

### D. Outras funções sem entry em `config.toml`

Todas as restantes (≈30 funções: `approve-transaction`, `update-transaction`, `create-user`, `delete-user`, `match-categories`, `extract-*`, `audit-categories`, `close-camarim-session`, `generate-historical-transactions`, `parse-coala-bp`, `apply-coala-bp`, `sync-coala-from-drive`, `google-drive-health`, `help-search`, `invite-company-admin`, `create-company`, `resolve-attachment-url`, `fetch-fx-rate`, `resend-reset-email`, `restore-debug`, `database-restore-v2`, `run-rls-legacy-audit`, `send-system-reminders`, `test-multi-tenant-isolation`, `check-login-rate`) não têm override → herdam o **default `true`**. Já estão protegidas. Nada a fazer.

**Excepção possivelmente preocupante:** `restore-debug` — se for callable e fizer algo destrutivo, vale auditar à parte. Não muda neste plano.

---

## Diff proposto

### `supabase/config.toml`

```toml
project_id = "ukpuhoynrqobqtzdbysp"

[functions]
  [functions.accept-invitation]
    verify_jwt = false      # link em email aceite anon
  [functions.auth-email-hook]
    verify_jwt = false      # webhook do Supabase Auth
  [functions.process-email-queue]
    verify_jwt = true
  [functions.send-transactional-email]
    verify_jwt = true
  [functions.preview-transactional-email]
    verify_jwt = false      # gated por LOVABLE_API_KEY (não JWT Supabase) — NÃO mudar
  [functions.handle-email-unsubscribe]
    verify_jwt = false      # link em email anon
  [functions.handle-email-suppression]
    verify_jwt = false      # webhook do email provider
  [functions.request-password-reset]
    verify_jwt = false      # anon precisa pedir reset
  [functions.send-push-notification]
    verify_jwt = true       # ← MUDADO (era false)
  [functions.database-backup]
    verify_jwt = true       # ← MUDADO (era false)
  [functions.database-restore]
    verify_jwt = true       # ← MUDADO (era false)
  [functions.selective-restore]
    verify_jwt = true       # ← MUDADO (era false)
  [functions.surgical-restore]
    verify_jwt = true       # ← MUDADO (era false)
```

### Ajustes em callers

**Nenhum.** Todos os callers actuais já enviam JWT válido.

### Cron `daily-database-backup` (opcional, não-blocker)

Migrar para service_role do Vault — ver Achado B. Plano separado se aprovares.

---

## Smoke tests pós-deploy (em Test, depois Live)

1. **Frontend admin → "Backup agora"** em `/admin/backups` → 200, ficheiro novo no bucket `database-backups`.
2. **Cron 02:00 UTC (summer) ou 03:00 UTC (winter)** → consultar `net._http_response ORDER BY id DESC LIMIT 5` no dia seguinte → status 200 e ficheiro do dia presente.
3. **Frontend admin → "Restore completo"** em backup recente (numa entrada não-destrutiva, ex: backup vazio de teste) → 200.
4. **Frontend admin → "Restore selectivo"** numa tabela inócua → 200.
5. **Push notification** → criar uma `payment_list` com `status='pending_approval'` (que dispara o badge em `app-icon-badge.ts`) → confirmar push entregue ao admin subscrito.

## Rollback

Reverter exclusivamente as 5 linhas de `config.toml` para `verify_jwt = false` e re-deploy. Sem migração DB, sem mudança em código JS — rollback em <2 min.

## Critério de sucesso

- 5 funções com `verify_jwt = true` deployadas em Live.
- 24h sem 401 inesperado nos logs (`supabase--edge_function_logs` para cada uma).
- Backup automático das 03:00 (Lisbon → 02:00/03:00 UTC) gerado no dia seguinte ao deploy.

## Restrições / notas finais

- **Sem alteração no Vault nesta volta** — cron continua com anon key (já compatível com `verify_jwt=true`).
- **Sem alteração em código de callers** — confirmado por `rg`.
- Order de aplicação sugerida: Test primeiro (smoke), 24h, depois Live.
