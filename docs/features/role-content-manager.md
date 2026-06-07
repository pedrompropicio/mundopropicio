# Role `content_manager` — Gestor de Conteúdo

Novo role criado na Fase 1 de RBAC do MP CRM.

## O que abre
- Acesso ao admin **MP CRM** (`/crm`) — edição de fichas de evento (`event_marketing`) e restante conteúdo editorial.
- Pós-login é redirecionado diretamente para `/crm` (ver `AuthRoute` em `src/App.tsx` e `PostLoginRedirect`).

## O que NÃO abre
- Sem acesso ao ERP financeiro (sem permissões em `role_permissions`/`user_permissions`).
- Sem acesso ao módulo de campanhas `/audience` (esse continua exclusivo de `marketing_manager` + admin).

## Implementação
- Enum DB: `ALTER TYPE public.app_role ADD VALUE 'content_manager'`.
- `AppRole` em `src/contexts/AuthContext.tsx` (label "Gestor de Conteúdo", cor pink, prioridade 4).
- Gating no `CrmLayout` (`canCrm` inclui `content_manager`).
- Redirects em `AuthRoute` (`src/App.tsx`) e `PostLoginRedirect` apontam para `/crm`.
- Atribuível via `UserManagement` (entrou em `ASSIGNABLE_ROLES`).

## Notas
Não tem entradas em `role_permissions` — entra no `/crm` puramente pelo gating de role do `CrmLayout`.
