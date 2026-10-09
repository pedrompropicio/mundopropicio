---
name: Invariante pago_abaixo_do_bruto
description: Vigia (warn, empresa, ref 1) de transações pagas com paid_amount abaixo do bruto por mais de 0,02 €; tolerância obrigatória; única aceite é a Aquileia 2cc16b7f
type: feature
---

Issue #285, 09/10/2026. Função `public._run_invariant_checks_paid_below_gross()` (SECDEF, EXECUTE só service_role), unida em `_run_invariant_checks_all()`. Mesmo padrão de `transacao_duplica_fatura`.

Regra: `status='paid'`, `reversed_at IS NULL` e
`round((amount * (1 + COALESCE(iva_rate,0) / 100.0))::numeric, 2) - COALESCE(paid_amount,0) > 0.02`.
`/100.0` obrigatório (iva_rate é integer — ver iva-rate-divisao-inteira).

Tolerância 0,02 OBRIGATÓRIA: o bruto arredonda a 2 casas e o paid_amount pode ter mais casas (ex.: 'Bol' 5522,9952); sem ela há 16 falsos positivos de exactamente 0,01 €. Nunca trocar por `<` simples nem ajustar a tolerância para o número bater.

Exclusões (mantêm-se para o futuro): retenção de IRS declarada (`declared_withholding_amount`), crédito de fornecedor (`supplier_credit_usages`), compensação (`transaction_offsets`, qualquer lado), venda à porta retida pela sala (`ticket_office_settlements.venue_retained_invoice_id`, fecho não estornado).

Referência aceite = 1: transação 2cc16b7f-d890-4cad-b3e7-d07233d172f5, Portagens carrinha apoio camarim, AQUILEIA INVEST LDA, 2,58 € de falta, Coala Festival Portugal 2026 (evento completed, fecho de 3 participantes, encerramento definitivo, sem documento). Decisão do Pedro: não se reabre um evento encerrado por 2,58 € sem documento.
