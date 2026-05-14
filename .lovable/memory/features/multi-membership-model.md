---
name: Multi-membership model (1 user → N empresas)
description: Identidade única no auth.users; acessos por (user_id, company_id) em user_roles/user_permissions; switcher para qualquer user com ≥2 memberships
type: feature
---

## Modelo

- **Identidade única**: 1 row em `auth.users` por email; o mesmo user pode ter membership em N empresas.
- **`user_roles`**: UNIQUE `(user_id, company_id, role)`. Múltiplas linhas → roles independentes por empresa. `platform_admin` tem `company_id = NULL` (global).
- **`user_permissions`**: UNIQUE `(user_id, company_id, permission)` — overrides per-tenant.
- **`profiles.company_id`**: NULLABLE; é só "empresa principal" / fallback. A empresa ativa real vem de `current_company_id()`.
- **VIEW `user_companies`** (security_invoker, filtra por `auth.uid()`): catálogo das memberships do user atual com `primary_role`.

## Resolução de empresa ativa
`current_company_id()` ordem:
1. `profiles.active_company_id` se válida (user é platform_admin OU tem membership lá);
2. `profiles.company_id` se ainda tem membership lá;
3. primeira empresa em `user_roles` ordenada por `created_at`.

`set_active_company(uuid)`: aceita troca para qualquer empresa onde o caller tenha membership; platform_admin troca para qualquer ativa.

`has_role` / `has_permission`: tenant-aware — filtram por `current_company_id()` (mantêm `platform_admin` global).

## UI
- **`CompanySwitcher`** visível se `memberships.length ≥ 2` OU `isPlatformAdmin`. Lê de `useUserMemberships()` (view `user_companies`). Ao trocar, invalida toda a query cache.
- **`UserManagement`** lista membros da empresa ATIVA via `user_roles WHERE company_id = activeCompanyId`. "Eliminar" remove só a membership desta empresa; só apaga `auth.users` (via edge `delete-user`) se zero memberships restantes. Mudança de role só toca user_roles desta empresa.

## Edge function `create-user`
Body: `{ email, full_name, role, dry_run? }`. Pré-check em `auth.users.listUsers`:
- existe + tem membership na empresa ativa → `status: 'already_member'` (toast destrutivo).
- existe + sem membership → `status: 'will_attach'` em dry_run; em commit cria user_role + profile (se não havia) sem novo email. UI mostra AlertDialog antes de confirmar.
- não existe → `status: 'will_create'` em dry_run; em commit cria auth user + envia email transacional de definição de senha.
Caller tem de ser admin na própria empresa ativa.

## Regras a manter
- Nunca remover row de `auth.users` apenas porque uma membership foi apagada.
- `user_roles UPDATE` global está PROIBIDO — sempre escopar por `company_id` (delete+insert por empresa).
- `profiles.company_id` deixa de ser fonte de verdade do tenant — só RPC `current_company_id()`.
