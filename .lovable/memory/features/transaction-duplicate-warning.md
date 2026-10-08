---
name: Aviso de duplicação de fatura (#284)
description: Aviso âmbar não bloqueante de duplicado em transações mãe; TRÊS regras cumulativas (invoice_ref, amount_date, description); absorveu a guarda de setembro; ecrãs cobertos e excluídos com motivo
type: feature
---
## Aviso de duplicação de fatura (#284)

Mecanismo ÚNICO: `src/lib/transaction-duplicate-check.ts` (matcher puro `matchDuplicateCandidates` + `findDuplicateTransactions`) e bloco âmbar `TransactionDuplicateWarning` (padrão #274), com visto "Confirmo que não é a mesma despesa". **Nunca bloqueia** — fatura repartida por várias linhas (#29) e proformas repetem a ref de propósito.

Regras CUMULATIVAS (correm todas as que tiverem dados; união sem repetidos, cada candidata com a sua `rule`). Só mães vivas (parent_transaction_id IS NULL, reversed_at IS NULL), mesma empresa; edição exclui a própria:
- `invoice_ref` — mesmo fornecedor + ref normalizada (trim, maiúsculas, espaços colapsados), valor livre.
- `amount_date` — mesmo fornecedor + valor ±0,01 + data a menos de 30 dias. Corre também com ref preenchida (caso Montaditos: ref só num lado).
- `description` — mesma descrição (ilike) no mesmo evento, com valor igual OU mesmo fornecedor. NÃO descarta quando só uma linha tem ref (esse era o buraco).
- Várias regras na lista → título/texto genéricos.

Guarda de setembro absorvida: `checkDuplicatesAndSubmit`, `showDuplicateConfirm`, `duplicateMatches` e o aviso vermelho saíram do TransactionFormModal. Encadeamento intacto: janela administrativa (overridePrompt) → `continueSubmitFlow` (proration, exceções isTransitory e capital) → `proceedWithCreate`.

Ecrãs cobertos (3 regras): TransactionFormModal, TransactionEditModal, CacheTransactionModal, ReimbursementNoteDetail (estes dois sem ref nem descrição passada → na prática só `amount_date`).
PartnerPaidExpensesPanel: SÓ `invoice_ref` (`onlyInvoiceRefRule`) — comprovativo é muitas vezes talão/recibo/extrato sem ref; as outras regras disparariam em quase tudo. Sem ref, não avisa.

Ficam de fora:
- NewCardExpenseModal — já tem a guarda da #274; dois avisos é ruído.
- FinancialOperationsTab (Grupo 10) — as duas pernas de transferência/carga partilham a ref de propósito (par TikTok 100 € de 24/09).
- RecurringTransactions — encargo mensal é o mesmo fornecedor e valor a cada 30 dias.
- QuickAdvanceModal — adiantamentos sem fatura.
- Quotations — cotação não é despesa lançada.
- Automáticos (close-card-session, close-camarim-session, ads-invoice-apply, apply-coala-bp, classify-coala-tx-with-ai, audit-invoice-groups, EventForecast, SponsorsImportModal, sponsorship-bp-sync, TicketOfficeSettlementsPanel, BpUnusedBudgetPanel, TransactionInstallmentGroupEditor, admin-window) — ninguém ao ecrã para confirmar; ficam para a invariante diária (tarefa própria).
- StandaloneInvoiceScanner / ingest-standalone-invoice — nunca criam transação.
