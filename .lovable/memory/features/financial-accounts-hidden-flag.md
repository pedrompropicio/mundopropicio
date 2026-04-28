---
name: Financial accounts hidden flag
description: Flag is_hidden em financial_accounts esconde a conta dos seletores de criação (transações, camarim, reembolso, adiantamento) mas mantém-na em relatórios
type: feature
---
- Coluna `financial_accounts.is_hidden` (boolean, default false). Toggle "Ocultar de seletores" disponível no modal de gestão (admin).
- Filtros `.eq("is_hidden", false)` aplicados em: TransactionFormModal, TransactionEditModal, TransactionPaymentModal, TransferFormModal, BatchPaymentModal, ReimbursementNoteDetail, CamarimFundMoveModal, CamarimItemModal (prepaid), QuickAdvanceModal, RecurringTransactions.
- NÃO aplicar em: relatórios, filtros de pesquisa, página FinancialAccounts, fluxos de bilheteira/fecho — devem continuar a ver tudo.
- Conta "Eventos Históricos" marcada is_hidden=true por defeito (uso exclusivo para alocação de despesas históricas via fluxo dedicado).
