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

## Auditoria só depois do UPDATE condicional (05/10/2026)

Incidente: um clique em "Aprovar 1 selecionada" gerou 39 chamadas a `approve-transaction` e 39 linhas falsas "pending→approved" (a auditoria era gravada ANTES do UPDATE). Diagnóstico em `docs/diagnosticos/aprovar-transacao-39-chamadas-2026-10-05.md`.

- Edge `approve-transaction` (`approve-core.ts` → `approveAndAudit`): `UPDATE ... SET status='approved' WHERE id IN (...) AND status IN ('pending','overdue') RETURNING id` primeiro; `transaction_audit_log` só para os ids devolvidos; os restantes passam a `skipped`. O mesmo nas filhas de rateio. Nunca voltar a auditar antes do UPDATE.
- Frontend (`Transactions.tsx`): trinco síncrono `approvingRef` (`src/lib/approve-lock.ts`) partilhado por `requestApprove` e `handleBulkApprove`, activado antes do 1.º await e libertado nos returns antecipados e no `onSettled`; estado `validating` desactiva o botão em lote e os de cada linha; repetição de tecla ignorada (`e.repeat`). Os toasts de erro mostram o código HTTP.

## Aprovação atómica pela RPC (05/10/2026, D-ERP173)

- A edge `approve-transaction` só AUTORIZA (JWT, multi-tenant, `approve_transactions`, `raise_budget` por empresa da linha, D1, expansão invoice_group) e chama `public.approve_transactions_atomic(p_ids, p_raises, p_caller_name)` (`approve-rpc.ts`). `approve-core.ts` foi apagado.
- A RPC (SECURITY DEFINER, EXECUTE só service_role) tranca com `FOR UPDATE SKIP LOCKED`, recalcula o excesso, aplica raises, aprova, audita só as trancadas, grava `bp_budget_raised` e propaga às filhas. Não trancadas → `skipped_ids`.
- Excesso sem raise válido → `P0409` (DETAIL = jsonb das linhas) → edge devolve 409 `{error, budget_excess}`. Nunca voltar a UPDATEs soltos na edge.
- Prova: `supabase/tests/approve_transactions_atomic.sql`.
