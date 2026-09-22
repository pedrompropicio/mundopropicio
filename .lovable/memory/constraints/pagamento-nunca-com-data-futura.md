---
name: Pagamento nunca com data futura
description: payment_date em transactions e transaction_payments nunca pode ser posterior a hoje; saídas previstas vivem em due_date
type: constraint
---

`transactions.payment_date` e `transaction_payments.payment_date` nunca podem ser posteriores à data de hoje. Uma saída prevista regista-se em `due_date`, não em `payment_date`.

- **Regra:** `payment_date` é um facto (dinheiro que já saiu), não uma promessa.
- **Onde está travado na base de dados:**
  - `public.validate_paid_requires_payment_date()` — trigger `enforce_paid_payment_date` em `public.transactions` (BEFORE INSERT OR UPDATE);
  - `public.validate_payment_date_not_future()` — trigger `enforce_payment_date_not_future` em `public.transaction_payments` (BEFORE INSERT OR UPDATE).
- **Por que duas funções:** a liquidação escreve em `transaction_payments`, e `sync_paid_amount_from_payments()` só propaga `payment_date` para a transação quando o pagamento fecha o valor total. Um pagamento PARCIAL com data futura passaria sem tocar na transação, daí a trava também na tabela de parcelas.
- **Data de referência:** a comparação usa `(now() AT TIME ZONE 'Europe/Lisbon')::date`, e não `current_date` nem `now()::date` do servidor UTC, para não recusar por engano um lançamento feito do Brasil ao fim do dia.
- **O que NÃO partiu:** `renegotiate_transaction_installments()` já criava as parcelas com `payment_date` a `NULL` e só com `due_date` preenchido — continua válido e é o caminho certo para pagamentos programados.
- **Efeito no saldo:** uma transação paga com data futura escapa à data de corte da implantação (`initial_balance_date`) e desconta do saldo implantado, fazendo a conta bancária divergir do extrato. Foi assim que se descobriu (Coala Festival, 2.413,50 € com `payment_date = 2026-11-03`).

**Why:** pagamentos são factos passados; datas futuras falseiam o saldo de caixa e a conciliação bancária.
