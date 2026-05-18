---
name: Event view permissions (granular per-tab)
description: 4 permissões granulares (view_bp/view_sponsorship/view_ab/view_simulator) controlam visibilidade de abas no EventDetail; gate frontend + RLS
type: feature
---

## Permissões (todas tenant-aware via `has_permission(uid, key)`)

| Key | Aba EventDetail | Tabelas RLS gated |
|---|---|---|
| `view_events` (existente) | Resumo + Bilheteira | `event_ticket_lots`, `event_ticket_office_advances` |
| `view_bp` | Business Plan | `event_forecasts` |
| `view_sponsorship` | Patrocínios | `sponsorship_pipeline`, `sponsorship_pipeline_activities` |
| `view_ab` | A&B | `event_ab_config`, `event_ab_zones` |
| `view_simulator` | Simulador | `event_simulator_config`, `event_simulator_inputs`, `event_simulator_zone_config`, `event_simulator_cost_lines` |

Abas **Cachê / Sócios / Overhead / Fecho** continuam gated por `isAdmin || isManager` (não há permission granular).

## Defaults por role

| Role | view_events | view_bp | view_sponsorship | view_ab | view_simulator |
|---|---|---|---|---|---|
| admin / platform_admin | ✅ (bypass total) | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ | ✅ | ✅ |
| viewer | ✅ | ❌ | ❌ | ❌ | ❌ |
| partner | ❌ | ❌ | ❌ | ❌ | ❌ (usa Portal do Sócio, não EventDetail) |
| marketing_manager | ❌ | ❌ | ❌ | ❌ | ❌ |

## Overrides per-user

`UserPermissionsModal` (acessível em /admin → gestão de utilizadores → "Permissões") lista TODAS as perms de `ALL_PERMISSIONS` automaticamente. Granted=true acrescenta, granted=false remove face ao default do role. Escopado a `(user_id, company_id)` da empresa ativa.

Mudança refletida após próximo `fetchRoleAndPermissions` em `AuthContext` (ocorre em login / TOKEN_REFRESH com user diferente). Para refletir imediatamente, o user precisa de reload.

## Defesa em profundidade (RLS)

Padrão para policies SELECT das tabelas listadas:
```sql
USING (
  public.is_platform_admin()
  OR (company_id = public.current_company_id()
      AND public.has_permission(auth.uid(), '<view_xxx>'))
)
```
Mantém-se a policy RESTRICTIVE `company_isolation_*` como rede.

## Template para adicionar uma nova permission de visualização

1. INSERT em `role_permissions` para admin/manager/editor (defaults).
2. Substituir policy SELECT da(s) tabela(s) pelo padrão acima.
3. Adicionar entry em `ALL_PERMISSIONS` (`src/contexts/AuthContext.tsx`).
4. Adicionar gate `hasPermission('view_xxx')` no componente/aba.
5. Atualizar este ficheiro.

## Histórico
- 2026-05-18: criadas as 4 permissões; legacy `auth.uid() IS NOT NULL` removida de `event_forecasts`, `event_ticket_lots`, `event_ticket_office_advances`.
