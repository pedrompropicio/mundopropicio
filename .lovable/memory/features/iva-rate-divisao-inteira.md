---
name: iva_rate é integer — divisão inteira no bruto (#285)
description: COALESCE(iva_rate,0)/100 dá 0 em SQL porque iva_rate é integer; corrigidas reimbursement_propagate_payment e get_partner_settlement_summary; regra: bruto a partir de iva_rate usa /100.0
type: constraint
---
# iva_rate é integer — divisão inteira (#285, 09/10/2026)

**Causa:** `iva_rate` é `integer` em transactions, event_forecasts, event_ticket_lots, recurring_transactions, operacao_etapa_suppliers e quotations. Em SQL, `COALESCE(iva_rate,0)/100` é divisão inteira e dá 0, logo `1 + iva/100` = 1 e o "bruto" sai igual à base.

**Corrigidas (migração 0045_derp198):**
- `reimbursement_propagate_payment`: paid_amount das despesas-filhas da nota saía = amount (8 linhas de 08/10 e 51 antigas).
- `get_partner_settlement_summary`: as duas ocorrências do `CASE WHEN v_gross` (partner_paid_expenses e event_forecasts) — desembolso do sócio pt-BR sem IVA.

**Regra:** qualquer cálculo de bruto ou IVA a partir de `iva_rate` em SQL usa `/ 100.0` (ou multiplica `amount * iva_rate` antes de dividir, como em approve_transactions_atomic, que é numeric × int e está correcta). Nunca `iva_rate / 100`.
