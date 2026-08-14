---
name: Guardrails de liquidação na criação de transações
description: Editor não cria transação já paga; admin/manager só com conta; trigger BEFORE INSERT bloqueia paid sem account_id (com isenções)
type: feature
---

Regra: nenhuma transação nasce liquidada sem controlo.

1. **Formulário de criação (`TransactionFormModal`)**
   - `canCreatePaid = isAdmin || isManager`; `effectiveAutoMarkPaid = autoMarkPaid && canCreatePaid`.
   - Papéis abaixo de manager: criação sempre em aberto (aviso "A liquidação faz-se no modal de pagamento após a criação"). Tentativa de criar paga é rejeitada no `mutationFn`.
   - Admin/manager podem criar paga, mas **conta obrigatória** (`account_id`) — validação no submit + aviso inline.
   - Liquidação legítima passa por: modal de pagamento (incl. "Pago pelo Sócio" com aprovação), listas de pagamento, cartões, reembolsos, camarim.

2. **Reforço na BD** — trigger `trg_enforce_tx_paid_requires_account` (BEFORE INSERT em `public.transactions`, função `enforce_tx_paid_requires_account`): rejeita `status='paid'` com `account_id IS NULL`.
   Isenções documentadas:
   - `current_user` em (`service_role`, `postgres`, `supabase_admin`) → edge functions e importações (Coala "Pago BR", Ticketline, camarim, cartões);
   - `is_transitory = true` (caução, irmã "extra do sócio" parcial criada em `TransactionFormModal`/`TransactionEditModal`);
   - `exclude_from_result = true`;
   - `is_reimbursement = true`.

   "Pago pelo Sócio" liquida por UPDATE (não INSERT), logo não é afetado.
