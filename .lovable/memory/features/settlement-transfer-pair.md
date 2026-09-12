---
name: Transferência do fecho de bilheteira
description: create_settlement_transfer cria o par expense+income na rubrica 10.3 com operation_key TRF-FECHO-; não existe transação de tipo 'transfer'
type: feature
---

# Transferência do fecho de bilheteira (issue #132, 12/09/2026)

**Regra:** transferência entre contas = par `expense` (conta de origem) + `income`
(conta destino) na rubrica `10.3 Transferências Internas`
(`b32df086-c995-4747-a3f9-bfefa0063d0a`). `transactions_type_check` só aceita
`income` e `expense` — **nunca** `type: 'transfer'`, e `transactions` não tem
`target_account_id` nem `expected_date`.

No fecho de bilheteira quem cria o par é
`public.create_settlement_transfer(p_settlement_id, p_from_account_id,
p_to_account_id, p_amount, p_date, p_credited)`: SECURITY DEFINER, portão
`admin` / `platform_admin` / permissão `manage_accounts`, empresa do fecho validada,
EXECUTE só a `authenticated`. Recusa valor ≤ 0, contas iguais e fecho já com
transferência. Ambas as pernas com
`operation_key = 'TRF-FECHO-' || upper(left(replace(settlement_id,'-',''),8))`,
`iva_rate = 0`, `payment_method = 'transfer'`, `exclude_from_result = true`.
Só a função escreve `transfer_transaction_id`, `net_transferred` e
`transfer_account_id`. Se falhar, o fecho volta a `draft` e o erro aparece — nunca
engolido.

**Estorno** apaga as duas pernas pela `operation_key`. **Confirmar crédito** liquida
as duas pernas em conjunto. `QuickAdvanceModal` usa o mesmo padrão de par
(`operation_key ADIANT-BILH-<8>`).

**Indicadores:** "Transferido" (`TicketOffices`, `TicketOfficeBalancePanel`) e a
coluna "Transferências" do relatório de auditoria somam despesas na rubrica 10.3,
separadas das restantes despesas. A fórmula do saldo (D-ERP15) não mudou.
Reconciliação validada em Live: BOL 140.765,00 €, Ticketline 275.792,63 €.
