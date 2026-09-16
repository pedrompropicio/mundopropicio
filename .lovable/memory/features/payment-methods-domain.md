---
name: Domínio de payment_method e referência MB
description: D-ERP44 fecha payment_method em 5 valores (fonte src/lib/payment-methods.ts + espelho na edge update-transaction + CHECK na base); service_payment exige Entidade 5 dígitos e Referência 9 dígitos (CHECK transactions_service_payment_requires_mb, issue #190)
type: feature
---

# `payment_method` — domínio fechado (D-ERP44)

Cinco valores, garantidos em três camadas:

- **Cliente:** `src/lib/payment-methods.ts` é a única casa dos valores, rótulos pt-PT,
  ícones e helpers (`isPaymentMethod`, `paymentMethodLabel`, `paymentMethodOptions`).
- **Servidor:** `supabase/functions/update-transaction/index.ts` repete a lista
  (`PAYMENT_METHODS`) porque o `src/` não é publicado com as edge functions; o teste
  `src/test/payment-method-domain.test.ts` compara as duas.
- **Base:** CHECK em `transactions.payment_method` e `transaction_payments.payment_method`.

`trg_force_no_account_on_compensation` compara a string exactamente com `'compensation'`:
qualquer grafia nova desarma o trigger em silêncio.

## Pagamento de Serviços exige referência MB (issue #190, 16/09/2026)

**Regra:** `payment_method = 'service_payment'` exige `payment_entity` com **exactamente
5 dígitos** e `payment_reference` com **exactamente 9 dígitos**. Sem os dois não há
pagamento possível no homebanking — deixar entrar dados incompletos é criar trabalho
manual no dia do pagamento.

Três camadas, a mesma frase em todas:

1. **Fonte única:** `validateServicePaymentFields({ payment_method, payment_entity,
   payment_reference })` devolve `null` ou
   `"Pagamento de Serviços exige Entidade (5 dígitos) e Referência (9 dígitos)"`
   (`SERVICE_PAYMENT_FIELDS_MESSAGE`). Nos restantes métodos devolve sempre `null`.
2. **Servidor:** `update-transaction` repete a verificação (400 com a mesma mensagem).
   Só valida quando o pedido **toca** em `payment_method`/`payment_entity`/
   `payment_reference` — editar a descrição de uma transação antiga incompleta não é
   recusado. `ads-invoice-apply` só usa `transfer`/`direct_debit`, não entra na regra.
3. **Base:** CHECK `transactions_service_payment_requires_mb`, criado **NOT VALID**
   (linhas antigas ficam como estão; por isso a recusa no servidor é indispensável).

**Interface.** `TransactionFormModal` e `TransactionEditModal`: Entidade e Referência
ficam obrigatórias com `*`, aceitam **só dígitos** (limite 5 e 9), moldura vermelha
enquanto não estiverem completas, erro inline por baixo e botão de guardar desativado.
Nos outros métodos nada muda. `BankLineLaunchModal` não oferece Pag. Serviços (grava
`transfer`), por isso só traduz o erro.

**Erro da base nunca aparece em bruto:** `friendlyPaymentError(err)` troca o 23514 com
o nome da constraint pela mesma frase; usado nos toasts dos três modais.
