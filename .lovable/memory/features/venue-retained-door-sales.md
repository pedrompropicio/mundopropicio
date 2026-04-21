---
name: Venda à porta retida pela sala (fecho de bilheteira)
description: No fecho de bilheteira de um evento, valores que a sala/recinto reteve por vendas à porta para abater de fatura (tipicamente aluguer) — abate ao líquido e cria pagamento parcial
type: feature
---

# Venda à porta retida pela sala

Algumas salas/recintos vendem bilhetes "na porta" no dia do evento e ficam com esse valor em caixa para abater do aluguer — repassando-nos apenas a diferença (ou nada, se a venda à porta cobriu o aluguer).

## Modelação

Campos em `ticket_office_settlements`:
- `venue_retained_amount` (numeric) — valor retido pela sala
- `venue_retained_invoice_id` (uuid → transactions) — fatura de despesa do evento que recebe o abatimento (opcional)
- `venue_retained_payment_id` (uuid → transaction_payments) — id do pagamento parcial criado na confirmação (compensação)
- `venue_retained_notes` (text) — observações livres
- `venue_invoice_remainder_paid` (boolean) — se a bilheteira liquidou o saldo restante da mesma fatura
- `venue_invoice_remainder_amount` (numeric) — valor do saldo restante pago pela bilheteira
- `venue_invoice_remainder_payment_id` (uuid → transaction_payments) — id desse 2.º pagamento (transfer/account_id=officeId)

## UI

Secção dedicada no `TicketOfficeSettlementModal` entre "Adiantamentos" e "Líquido":
- Campo "Valor retido (€)"
- Dropdown de **qualquer despesa do evento** com saldo em aberto (filtro: `event_id` + `type=expense` + `status in (pending, approved, paid)` + `_open > 0`). Inclui também o id já selecionado mesmo se ficou totalmente paga (para edição).
- Notas opcionais
- Validação: bloqueia confirmação se valor retido > saldo em aberto da fatura

O valor é abatido em `netCalculated`: `Bruto − Deduções − Adiantamentos − Retido pela sala − Saldo restante (se opt-in)`.

Quando há fatura selecionada e ainda existe saldo em aberto após o abatimento da retenção, surge uma checkbox **"Liquidar o saldo restante (€X) pela bilheteira"**. Marcando-a, esse valor é também abatido do repasse e cria-se um 2.º pagamento na fatura (do tipo `transfer`, `account_id=officeId`), fechando a fatura. Esta é a regra normal: a sala deduz a venda à porta + recebe o restante da bilheteira → promotor recebe só o líquido após esses dois abates.

## Fluxo na confirmação

Ao confirmar o fecho:
1. **Pagamento 1 (compensação)**: Insere `transaction_payments` na fatura com `payment_method='compensation'`, `account_id=null`, `amount=venue_retained_amount`. Guarda id em `venue_retained_payment_id`.
2. **Pagamento 2 (saldo restante, opcional)**: Se a checkbox estiver ativa, insere outra linha em `transaction_payments` com `payment_method='transfer'`, `account_id=officeId`, `amount=invoiceRemainder`. Guarda id em `venue_invoice_remainder_payment_id`. Marca `venue_invoice_remainder_paid=true`.
3. Atualiza a fatura: `paid_amount += (retido + restante)`. Se quitada, marca `status='paid'` e `payment_date=settlement_date`.

## Edição / reversão

Ao editar um fecho confirmado (admin):
- Se mudou valor, fatura, ou voltou a draft → apaga o `transaction_payments` antigo e devolve o `paid_amount` da fatura anterior, recalculando `status` (volta a `approved` se já não estiver totalmente paga).
- Depois cria novo pagamento se aplicável.

## Comportamento sem fatura

Se o utilizador preencher valor mas escolher "Sem fatura", o valor abate do líquido mas nenhum `transaction_payments` é criado. Aviso amarelo informa que terá de fazer o pagamento parcial manualmente depois.

## Razão do design (resposta às escolhas do user 2026-04-21)

- **Onde se regista**: Campo manual no fecho da bilheteira principal (não exige cadastrar a sala como bilheteira própria nem registo bilhete-a-bilhete).
- **Como abate**: Aluguer continua pelo total — venda retida vira pagamento parcial via `transaction_payments`. DRE limpo, despesa correta.
- **Quando entra**: No fecho/conciliação (a receita só é reconhecida ao confirmar o settlement; o abatimento na fatura também só acontece nesse momento).
- **Quem identifica a sala**: Selecionado manualmente no fecho (qualquer fornecedor com despesa em aberto no evento, não obrigatoriamente o venue cadastrado).
- **Conta financeira**: Não — só metadado no settlement + `transaction_payments` com `account_id=null` e `payment_method='compensation'` (não toca em saldos bancários).
