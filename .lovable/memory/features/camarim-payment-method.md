---
name: Camarim - Forma de pagamento por conta
description: Select unificado de forma de pagamento no lançamento de camarim com Caixa do camarim + cartões cadastrados + Recurso próprio, gravando financial_account_id por item
type: feature
---

## Regra
No `CamarimItemModal` o campo "Forma de pagamento" combina origem + conta numa só lista:
- **Caixa do camarim (adiantamento)** → `payment_origin = 'advance'`, `financial_account_id = NULL`. No fecho, a transação sai da conta vinculada ao último `camarim_fund_moves` da sessão (advanceAccountId).
- **Cada cartão de débito ativo** (`financial_accounts.type='card' AND is_active=true`, filtrado por RLS de visibilidade do user) → `payment_origin = 'card'`, `financial_account_id = <id do cartão>`. No fecho a transação sai exatamente desse cartão.
- **Recurso próprio (a reembolsar)** → `payment_origin = 'out_of_pocket'`, `financial_account_id = NULL`. Transação fica `approved` (não paga) para entrar no fluxo de reembolsos.

## Schema
- `camarim_items.financial_account_id uuid NULL REFERENCES financial_accounts(id) ON DELETE SET NULL` (idx `idx_camarim_items_financial_account_id`).
- Só é gravado quando `payment_origin = 'card'`; nas outras origens fica NULL para manter consistência.

## Validação
- Se `payment_origin = 'card'` e `financial_account_id` é null → bloqueia gravação com toast "Seleciona o cartão usado".

## Fecho (`close-camarim-session`)
- Card: `accountId = it.financial_account_id ?? body.card_account_id ?? null` (per-item primeiro, fallback no body para back-compat com itens antigos).
- Itens antigos sem `financial_account_id` continuam a funcionar se o caller passar `card_account_id` no body (comportamento legado).

## Não tocar
- `PAYMENT_ORIGIN_LABELS` em `camarim-helpers.ts` deixou de ser usado no select; manter para outros componentes que ainda referenciem (badges, dashboards).
