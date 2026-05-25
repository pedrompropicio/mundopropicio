
## Problema

Quando se declara retenção IRS (taxa/valor) numa transação (`declared_withholding_rate`/`declared_withholding_amount`), o sistema só usa esses valores para pré‑preencher o `TransactionPaymentModal`. Em todo o resto — lista de transações, lista de pagamento, modal de liquidação em lote e cálculo do saldo de conta — continua a mostrar e a movimentar o valor bruto. Resultado: o utilizador vê "a pagar = bruto", e mesmo ao liquidar com retenção no modal singular, o saldo da conta financeira é debitado em bruto porque é reconstruído a partir de `transactions.paid_amount` (que por regra fica em bruto para preservar BP/DRE).

## Regra confirmada

- `transactions.paid_amount` continua em **bruto** (memória `tax-withholding`: compromisso é 100% liquidado para BP/DRE).
- O que o fornecedor recebe = bruto − retenção declarada.
- O que sai realmente da conta = bruto − retenção − créditos.
- Só aplica em transações **sem parcelas** (transação que tenha linhas em `transaction_payments` ignora a declarada — a retenção é tratada por parcela).

## Mudanças

### 1. Helper `src/lib/withholding.ts`

```ts
export function getDeclaredWithholding(t: any): number;
export function computeNetPayable(opts: {
  grossWithIva: number;
  declaredWithholding: number;
  hasInstallments: boolean;
}): { gross: number; withholding: number; net: number; applied: boolean };
```

`applied = true` só quando `!hasInstallments && declaredWithholding > 0`. `withholding` é clamped a `min(declared, gross)`.

### 2. Detecção de parcelas (reutilizável)

Pequeno hook `useInstallmentTxIds()` que faz `select transaction_id from transaction_payments limit 50000` e devolve `Set<string>`. Usado por Transactions, PaymentListsTab (criação + viewer) e BatchPaymentModal. Cache `queryKey: ["transactions-with-installments"]`.

### 3. Lista de transações (`TransactionRow.tsx`)

- Nova prop `hasInstallments?: boolean`.
- Na célula do valor, abaixo da linha `Base: X + IVA Y%`, adiciona quando `applied`:
  ```
  A pagar (líquido): {net}   · Ret. IRS: -{w}
  ```
  Em tom `warning`, fonte mono, pequena. Não altera `Aberto` (que continua a refletir o compromisso bruto).

### 4. `Transactions.tsx`

- Adicionar query `installmentTxIds` e passar `hasInstallments={installmentTxIds.has(t.id)}` ao `TransactionRow`.

### 5. Lista de pagamento — selecionar transações (`PaymentListsTab.tsx` modal de criação, linhas 670‑705)

- Nova coluna `A pagar (líquido)` à direita do `Saldo`.
- Quando não há parcelas e há retenção declarada: mostra `formatCurrency(saldo − withholding)` em `warning`, com badge `-Ret. {w}€` por baixo. Caso contrário, mostra `—` ou repete o saldo discreto.
- Usa `installmentTxIds` carregado uma vez.

### 6. Lista de pagamento — viewer (`ViewPaymentList` em `PaymentListsTab.tsx`)

- Em cada linha exibida, adicionar abaixo do total a linha "Líquido: X · Ret. {w}" quando aplicável.

### 7. `BatchPaymentModal.tsx`

- Carregar `installmentTxIds`.
- Para cada `item`, calcular `declaredW = getDeclaredWithholding(item)` e `withholding = (!hasInstallments && declaredW > 0) ? min(declaredW, item.remainingEurFinal) : 0`.
- UI por linha:
  ```
  Descrição                            {remainingEurFinal}
                                       L: {net}  Ret.: -{w}
  ```
- Totais: adicionar `Retenção IRS: -{totalW}` e `Saída de caixa: {totalRemaining − totalW}`. `Total a liquidar` (= bruto compromisso) mantém-se.
- Validação de saldo passa a usar `totalRemaining − totalW` (não `totalRemaining`).
- No insert por item:
  - `paid_amount` continua em bruto (`finalPaid` como hoje).
  - Inserir registo em `transaction_payments` (hoje o batch **não cria**, vou adicionar) com `amount = settleEur`, `withholding_amount = w`, `account_id`, `payment_date`, `invoice_ref`.
  - Adicionar audit `Retenção IRS` quando `w > 0` (igual ao modal singular).

### 8. Saldo de conta — coerência

`computeAccountBalance` em `BatchPaymentModal.tsx`, `TransactionPaymentModal.tsx`, `SupplierTransactions.tsx`, `CacheSettlementPanel.tsx`, `TicketOfficeBalancePanel.tsx`, `ReportContasPagar.tsx`, `ReportSuppliersPage.tsx`, `ReportTicketOfficeAudit.tsx`, `PartnerEventDetail.tsx` continua a usar `transactions.paid_amount`. Para refletir caixa real, criar helper centralizado:

```ts
// src/lib/account-balance.ts
export async function fetchAccountCashAdjustments(): Promise<Map<string, number>>;
// devolve, por account_id, sum(withholding_amount + credit_amount) das linhas de transaction_payments
```

Cada local que computa balance subtrai esse ajuste do débito bruto (`bal += adj` para despesas), sem alterar `paid_amount`. Isto resolve o "valor real em caixa" sem mexer em BP/DRE.

**Nota**: este passo (8) é o mais sensível. Vou aplicá-lo com testes em modo "shadow" — manter o cálculo atual + log `console.debug` da diferença numa primeira iteração? Não. Aplicar diretamente mas só após validares o âmbito.

### 9. Memory

Atualizar `mem://features/tax-withholding` para refletir que o saldo de conta passa a descontar retenções/créditos via `transaction_payments`, e que a UI mostra líquido sempre que não há parcelas.

## Fora do âmbito

- Parcelas (`transaction_payments` planeadas): cada parcela já tem `withholding_amount` próprio inserido em `MarkInstallmentPaidModal`. Não alterado.
- Reembolsos, créditos de fornecedor: lógica inalterada.
- Receitas: retenção só faz sentido em despesas; UI esconde como hoje.

## Validação

1. Criar despesa €1000 + IVA 23% (bruto 1230) com retenção 25% = 307,50.
2. Lista de transações deve mostrar `-1230,00` + linha `A pagar (líquido): 922,50 · Ret. IRS: -307,50`.
3. Lista de pagamento (criação) deve mostrar coluna `A pagar (líquido): 922,50`.
4. BatchPaymentModal com 1 item: total bruto 1230, retenção -307,50, saída caixa 922,50; validação de saldo usa 922,50; após confirmar, conta debita 922,50 (não 1230).
5. DRE/BP da despesa continuam a contar 1230 (compromisso integral).
