---
name: Permissões da UI e overrides de admin
description: Como o AuthContext calcula permissões efectivas (#105) — admin parte de ALL_PERMISSIONS mas os overrides de user_permissions decidem, como em has_permission_in
type: feature
---

# Permissões efectivas na UI (#105, 20/09/2026)

Função pura: `src/lib/permissions.ts` → `resolveEffectivePermissions({ roles, rolePermissions, overrides, allPermissions })`.
Usada por `AuthContext.fetchRoleAndPermissions`; teste em `src/lib/__tests__/permissions.test.ts`.

Regra (réplica de `public.has_permission_in`, migration 20260514131452):

1. Base: `admin`/`platform_admin` → **todas** as permissões de `ALL_PERMISSIONS`; outros papéis → só `role_permissions`.
2. Por cima, `user_permissions` **decide**: `granted=false` retira, `granted=true` acrescenta.

Antes da #105 o admin recebia `ALL_PERMISSIONS` com `return` imediato e os overrides nunca eram lidos:
a UI mostrava ações que o servidor recusava (ex.: `manage_bp` negado a um admin). A autoridade continua
no servidor — RPC e políticas não foram tocadas.
