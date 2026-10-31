---
name: Conta-espelho de aporte do sócio (partner aporte mirror)
description: Contas com mirror_partner_aporte geram sozinhas o aporte, a ponte e o movimento de capital quando uma despesa fica paga. Nunca criar o aporte à mão.
type: feature
---

# Conta-espelho de aporte do sócio

**A regra em uma linha: numa conta com `mirror_partner_aporte = true`, o aporte do sócio NÃO se lança. Lança-se a despesa paga e o sistema faz o resto.**

Quem lançar o aporte à mão fica com tudo a dobrar. Aconteceu a 31/10/2026 no H&K Madrid: 36 aportes duplicados, 60.867,14 € a mais na conta de acerto. Foram apagados no mesmo dia.

## O que dispara

`public.sync_partner_aporte_mirror`, trigger sobre `transactions`. Age quando **todas** estas condições se verificam:

- a transação é `type = 'expense'` (o aporte é `income`, por isso nunca se espelha a si próprio);
- a conta (`account_id`) tem `mirror_partner_aporte = true` **e** `partner_id` preenchido;
- `status = 'paid'`;
- `reversed_at` é nulo.

O valor espelhado é o **`paid_amount`**, não o `amount` — ou seja, o **bruto c/IVA**. Com IVA 0 coincidem; com IVA não coincidem, e é o bruto que vai para o aporte.

## O que cria, de uma vez

1. A transação do aporte: `income`, descrição `'Aporte automatico — ' || descrição da despesa`, rubrica **10.1.01** da empresa, conta igual à da despesa, `supplier_id` do sócio, data e `payment_date` iguais às da despesa, `status = 'paid'`, `paid_amount` preenchido.
2. A ponte em **`partner_aporte_mirror`** (`source_transaction_id` → `aporte_transaction_id`). É esta tabela que liga os dois lados; um aporte criado à mão não a tem e fica órfão.
3. O movimento em `partner_capital_moves`, com `kind = 'aporte'` e `flow = 'partner_settlement'`.

## O que acontece depois

- **Mudar a despesa reescreve o aporte.** Em UPDATE, a função reescreve descrição, valor, datas, conta, evento e fornecedor do aporte a partir da despesa. Qualquer edição manual feita no aporte é perdida na primeira alteração da despesa.
- **Despagar ou estornar a despesa apaga o aporte.** Se o valor espelhado cai a zero (status deixa de ser `paid`, `reversed_at` preenchido, ou a conta deixa de ser espelho), a função apaga a transação do aporte; a ponte e o movimento de capital caem por cascata.
- A função exige a rubrica `10.1.01` na empresa. Sem ela, levanta excepção e a despesa não grava.

## Para quem faz entrada de dados

- Lançar **só a despesa**, paga, na conta-espelho. Não criar o aporte, não criar a perna de pagamento do aporte, não criar o movimento de capital.
- A despesa precisa da perna em `transaction_payments` (é o `paid_amount` que alimenta o espelho).
- Antes de lançar numa conta que não se conhece, ler a ficha: `SELECT name, type, mirror_partner_aporte, partner_id, is_accounting FROM financial_accounts WHERE id = '…'`.
- Conferir no fim: numa conta-espelho o número de despesas e o número de aportes tem de ser igual, e os totais também. Desequilíbrio = alguém lançou à mão.

## Conta conhecida com este comportamento

`Pgto Mágicos Acerto Madrid` (`251d708e-1c8d-41e7-9311-39914a269bc3`) — conta de acerto do sócio HK TOURING no evento H&K Madrid. `is_accounting = false`, `skip_balance_check = true`, saldo sempre zero por construção.

A consulta que encontra todas:

```sql
SELECT id, name, partner_id FROM public.financial_accounts WHERE mirror_partner_aporte;
```
