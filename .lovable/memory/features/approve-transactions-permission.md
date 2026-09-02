---
name: Aprovar transações é permissão (validada no servidor)
description: approve_transactions + raise_budget em role_permissions; trigger BEFORE UPDATE em transactions protege a transição para 'approved'; policy de UPDATE continua aberta a editor
type: feature
---

## Permissões

- `approve_transactions` — "Aprovar transações" (grupo Operacional). Defaults: admin, manager.
- `raise_budget` — "Elevar verba do BP" (grupo Operacional). Defaults: admin, manager.

Ambas em `ALL_PERMISSIONS` (`src/contexts/AuthContext.tsx`), logo aparecem no `UserPermissionsModal` e aceitam override por utilizador/empresa.

## Autoridade no servidor (não só na UI)

A aprovação é um **UPDATE direto** em `public.transactions` (não RPC). A policy `Transactions updatable by privileged roles` permite UPDATE a admin, manager **e editor** — e continua assim de propósito, porque o editor tem de poder **editar** transações (`manage_transactions`).

O que passou a estar protegido é apenas a **transição para `approved`**, via trigger:

```
BEFORE UPDATE ON public.transactions
  → public.enforce_transaction_approval_permission()
```

Regra:
1. Só actua quando `NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'`.
2. **Se `auth.uid() IS NULL` → PERMITE.** Excepção obrigatória: service_role, crons pg_cron, edge functions (`approve-transaction`, `apply-coala-bp`, `close-camarim-session`, `generate-historical-transactions`) e syncs escrevem sem identidade de utilizador. Remover esta excepção parte as automações todas.
3. Caso contrário exige `is_platform_admin() OR has_permission_in(auth.uid(), 'approve_transactions', NEW.company_id)`.
   Usa `has_permission_in` (não `has_permission`) porque a autoridade é na empresa **da transação**, não na empresa activa do utilizador.
4. Falha → `RAISE EXCEPTION ... ERRCODE '42501'` com "Sem permissão para aprovar transações nesta empresa."

A função tem `EXECUTE` revogado de PUBLIC/anon/authenticated (só corre como trigger).

## Frontend

`src/pages/Transactions.tsx`: `const canApprove = hasPermission("approve_transactions");`

## Auditoria de caminhos (2026-09-02)

Nenhum caminho aprova transações com identidade de editor:
- `Transactions.tsx` — botão gated pela permissão.
- `ReimbursementNoteDetail.tsx` — `canApprove = isAdmin || isManager` (aprova TXs pendentes da nota).
- edge fn `approve-transaction` — service_role, com gate próprio admin/manager.
- Restantes `status: "approved"` no código são INSERTs (não passam pelo trigger) ou em outras tabelas (`event_forecasts`, `card_session_items`, `quotations`).

## Histórico
- 2026-09-02: criadas as permissões + trigger; fechado o buraco de o editor poder aprovar por fora da UI.
