---
name: Motivo da transitória (transactions.transitory_reason)
description: D-ERP80 — is_transitory deixa de ser um booleano sem motivo; sete motivos fechados, gravados por todos os caminhos, exigidos por CHECK e vigiados por invariante
type: feature
---

Criado a 17/09/2026 (D-ERP80). Antes, `is_transitory` era um booleano sem motivo e a invariante do Extra do Sócio tinha de adivinhar pela descrição.

Domínio fechado (CHECK `transactions_transitory_reason_domain`), sete valores:
`partner_advance` (Extra do Sócio — só nasce pela conversão, tem linha em `partner_advance_expenses`), `repasse`, `caucao`, `emprestimo_socio` (10.1.04), `carga_cartao` (as duas pernas do par 10.3), `aporte_socio` (10.1.*, inclui o espelho automático em 10.1.01), `entrada_a_repassar` (TPA/cashless/vendas de operador).

Regra: `transactions_transitory_reason_required` — `NOT is_transitory OR transitory_reason IS NOT NULL`, **validada** em Live a 17/09/2026. Quando `is_transitory` passa a false, o motivo limpa-se sozinho (`force_transitory_for_capital_branch`).

Quem grava o motivo:
- Base: `force_transitory_for_capital_branch` (10.1.04 → `emprestimo_socio`; restantes 10.1.* → `aporte_socio`); `card_load_on_out_paid` (perna de entrada → `carga_cartao`). `sync_partner_aporte_mirror` herda pelo trigger do capital.
- Aplicação: `cardLoadHelpers.ts` (perna de saída → `carga_cartao`); `BankLineLaunchModal.tsx` (entrada → `entrada_a_repassar`, saída → `repasse`); `TransactionFormModal.tsx` e `TransactionEditModal.tsx` (interruptor manual com selector obrigatório de `MANUAL_TRANSITORY_REASON_OPTIONS`, sem Extra do Sócio; conversão em Extra do Sócio e irmã do parcial → `partner_advance`).
- Constantes e etiquetas PT: `src/lib/transitory-reason.ts`. Campo permitido na edge `update-transaction` (rótulo de auditoria "Motivo da transitória"), partilhado entre parcelas.

Backfill de 17/09/2026: 41 transitórias, 286.443,12 €, zero sem motivo — `aporte_socio` 19 · `repasse` 7 · `carga_cartao` 3+3 · `entrada_a_repassar` 3 · `partner_advance` 3 · `emprestimo_socio` 2 · `caucao` 1.

Invariante nova no motor consolidado: `transitoria_partner_advance_sem_linha` (error, âmbito global, referência 0) — motivo `partner_advance` sem linha em `partner_advance_expenses`. Contagem a 17/09/2026: 0.

Não copiam transações e por isso não copiam motivo: `create_scenario_draft`, `promote_scenario_to_active`, `_revert_event_to_version` (copiam `event_forecasts`); `renegotiate_transaction_installments` recusa transitórias.

Nota: `10.1.05 Reembolso de Empréstimo de Sócio` cai em `aporte_socio` pela regra literal do plano; não há linhas nessa rubrica.
