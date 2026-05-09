---
name: Edge functions verify_jwt hardening
description: 5 funções sensíveis migradas para verify_jwt=true em 2026-05-09; preview-transactional-email mantém false por design
type: feature
---

## Aplicado 2026-05-09

`supabase/config.toml` — 5 funções passaram de `verify_jwt = false` → `true`:

- `database-backup`
- `database-restore`
- `selective-restore`
- `surgical-restore`
- `send-push-notification`

Sem alteração em `supabase/functions/*/index.ts` nem em callers (`src/`). Todos os callers já enviavam JWT válido (frontend admin via `supabase.functions.invoke`, crons via anon key). Anon JWT é válido para o gateway com `verify_jwt=true` — guards internos (admin role, tenant scoping, Lisbon time gate) continuam a fazer o trabalho de autorização.

## Exclusão intencional: `preview-transactional-email`

Mantém `verify_jwt = false` porque é gated por header `Authorization: Bearer <LOVABLE_API_KEY>` (backend Go da Lovable), não por JWT do projeto Supabase. Ligar `verify_jwt=true` quebra o caller. Comentário no `config.toml` documenta isto para evitar futura "limpeza" errada.

## Smoke esperado

Cada uma das 5 funções:
- sem header `Authorization` → **401** (gateway bloqueia antes de chegar ao código)
- com JWT válido (anon ou user) → **200** ou erro de negócio (não 401)

## Backlog

- `surgical-restore` é órfã na UI (`rg "surgical-restore" src/` = 0). Decidir: plugar num modal admin ou remover.
- Crons `daily-database-backup*` usam anon key. Migrar para service_role do Vault (pattern do `process-email-queue`) para defesa em profundidade. Não-blocker.
- `restore-debug` — auditar à parte se for callable e destrutivo.
