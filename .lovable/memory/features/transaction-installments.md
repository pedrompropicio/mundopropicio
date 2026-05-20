---
name: Transaction installments (Modelo B)
description: Parcelamento de transações — 1 TX fiscal + N rows em transaction_payments com scheduled_date e status (planned/paid/cancelled); triggers sincronizam paid_amount/status/payment_date da TX
type: feature
---

# Parcelamento de transações — Fase 1

## Modelo conceptual

- **1 TX = 1 documento fiscal**. Aprovação, BP linkage (FK 1:1) e categoria continuam por TX inteira.
- **N parcelas vivem em `transaction_payments`** (mesma tabela das liquidações). Discriminador: `scheduled_date IS NOT NULL` OU `status IN ('planned','cancelled','paid')` no contexto de uma TX com cronograma.
- TX legacy (sem cronograma) ficam intocadas — o trigger detecta e ignora.

## Schema (migrations 20260520*)

```
transaction_payments
  + scheduled_date date NULL
  + status text NOT NULL DEFAULT 'paid'
    -- enum check: planned | paid | cancelled
```

Função helper:

```sql
tx_has_installment_schedule(_tx_id uuid) RETURNS boolean STABLE
  -- true se existe alguma row para a TX com scheduled_date OR status IN ('planned','cancelled')
```

## Triggers

### `trg_sync_paid_amount_from_payments` (AFTER INSERT/UPDATE/DELETE ROW)

Recalcula `transactions.paid_amount`, `status`, `payment_date` a partir das parcelas:

- `paid_sum = SUM(amount) WHERE status='paid'`
- `gross = transactions.amount * (1 + iva_rate/100)` (compara em **bruto**)
- `paid_sum <= 0.01` → `pending`, `paid_amount=0`, `payment_date=NULL`
- `paid_sum >= gross - 0.01` → `paid`, `payment_date = MAX(payment_date das paid)`
- `0 < paid_sum < gross` → `partially_paid`, `payment_date=NULL`

Guard contra recursão: `pg_trigger_depth() > 1` retorna cedo.

**Só age em TXs com cronograma**: `v_has_schedule` (estado actual) OU `v_old_was_schedule` (no DELETE, OLD trazia `scheduled_date` ou status do cronograma). TXs legacy ficam intocadas.

### Bug histórico (resolvido 2026-05-20)

`OLD IS NOT NULL` em PL/pgSQL para composite types segue semântica SQL `ROW IS NOT NULL` — só é true se **todas** as colunas forem não-null. Como `transaction_payments` tem várias colunas nullable (`account_id`, `payment_entity`, `invoice_ref`, `notes`…), `OLD IS NOT NULL` dava `false` em DELETE, o bloco que populava `v_old_was_schedule` não executava, e apagar todas as parcelas não resetava a TX para `pending/0`. Fix: usar `IF TG_OP = 'DELETE'` directamente.

### `trg_validate_installments_total` (BEFORE INSERT/UPDATE ROW)

Bloqueia se `SUM(planned + paid)` exceder `gross + 0.01`. Não conta `cancelled`.

## Regras de negócio

- Status da TX é **derivado**, não editável directamente quando há cronograma.
- Aprovação continua por TX inteira (`payment_lists` inalterada).
- BP↔TX continua 1:1 (regra L2 intacta — ver `transactions-bp-linkage.md`).
- Sync Coala lê TX como antes (1 TX = 1 linha externa).
- IVA: comparação em bruto. `transactions.amount` é líquido, `paid_amount` é bruto (alinhado com a prática legacy).

## Outliers preservados

- TX `31497cab-…` (Aluguel espaço): `paid_amount=11.842€` excede gross calculado. Não tem rows em `transaction_payments` → trigger não age. Mantida intencionalmente para não afectar histórico.

## Roadmap

- **Fase 1** ✅ Schema + triggers + 8 cenários validados (commit `57f35806…`, fix bug C7 a 2026-05-20)
- **Fase 1.5** ⏳ Frente B (UI): toggle "Pagar em parcelas" no `TransactionFormModal` + secção parcelas planeadas no `PaymentTimeline` com "Marcar como paga"
- **Fase 2** ⏳ Cashflow / `ReportForecastPayables` a ler `scheduled_date` em vez de `due_date` agregado
- **Fase 3** (futuro) Dividir parcela, renegociação avançada, aprovação por parcela

## Cenários de teste (manter ao mexer no trigger)

| # | Acção | Estado esperado da TX |
|---|---|---|
| 1 | INSERT 1ª `planned` | 0 / pending |
| 2 | INSERT 2ª `planned` | 0 / pending |
| 3 | UPDATE 1ª planned→paid | 73.80 / partially_paid |
| 4 | UPDATE 2ª planned→paid | 147.60 / paid + payment_date = MAX |
| 5 | UPDATE 1 paid→planned | 73.80 / partially_paid |
| 6 | UPDATE última paid→cancelled | 0 / pending |
| 7 | DELETE todas | 0 / pending |
| 8 | INSERT excesso (>gross) | EXCEPTION check_violation |

TX-modelo para reset: `1abb9b9a-09f5-44c7-bf0c-7821f71baba0` (`[SEED] Software SaaS Fev 2026`, amount=120 net, iva=23 → gross=147.60).
