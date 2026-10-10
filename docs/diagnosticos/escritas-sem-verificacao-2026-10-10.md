# #196 — escritas supabase-js sem verificação de erro/linhas (varredura 10/10/2026)

Padrão procurado: `await supabase.from(x).insert|update|delete|upsert(...)` cujo resultado não é lido. Total: 172 (antes das correções).

## Corrigidas (multi-tabela ou de permissão)
- Extra do Sócio (5 sítios) → RPC atómicas `convert_transaction_to_partner_extra` / `revert_partner_extra`: TransactionEditModal (converter, split parcial, reverter, reverter com linha BP, remover split), TransactionFormModal (criação com extra, inteiro e parcial).
- mustWrite (erro + linhas afectadas em UPDATE/DELETE): TransactionEditModal 1930, 2236 (invoice_group_id); TransactionFormModal 1857 (event_forecasts), 1943 (reimbursement_note_items), 1955 (reimbursement_notes); TransactionPaymentModal 533 (supplier_credit_usages), 544 (supplier_credits), 588 (transactions); TransactionRow 799/818 (event_forecasts); BatchPaymentModal 519 (transactions).

## Ficam listadas (por prioridade)
P1 — escritas de negócio a rever a seguir: delete-transaction-cascade.ts (15), TicketOfficeSettlementModal (12), EventForecast (13), TicketOfficeSettlementsPanel (6), useSyncCacheForecasts (8), EventDetail (7), ImplBPTab (6), SupplierCreditsPanel (3), LinkReimbursementNoteModal (4), camarim/* (5), card-item-documents (2), BankReconciliation (3).
P2 — auditoria (transaction_audit_log; best-effort por desenho): TransactionFormModal, TransactionPaymentModal, BatchPaymentModal, TransactionPaymentsListModal.
P3 — restantes (simulador, importadores, CRM, MFA).

Rollbacks compensatórios dentro de ramos de erro (TransactionEditModal 2083, 2287) ficam sem verificação de propósito: já se está a mostrar o erro original.

```
src/components/BPAttachmentModal.tsx:109 insert transaction_documents
src/components/BPAttachmentModal.tsx:137 delete transaction_documents
src/components/BatchPaymentModal.tsx:440 insert transaction_audit_log
src/components/CacheTransactionModal.tsx:380 insert transaction_documents
src/components/CacheTransactionModal.tsx:388 update event_forecasts
src/components/EventEditModal.tsx:156 delete event_dates
src/components/EventForecast.tsx:1125 update events
src/components/EventForecast.tsx:1161 update events
src/components/EventForecast.tsx:1280 insert transaction_audit_log
src/components/EventForecast.tsx:1288 insert transaction_audit_log
src/components/EventForecast.tsx:1325 insert transaction_documents
src/components/EventForecast.tsx:1332 update event_forecasts
src/components/EventForecast.tsx:1450 insert transaction_audit_log
src/components/EventForecast.tsx:1458 insert transaction_audit_log
src/components/EventForecast.tsx:1471 update event_forecasts
src/components/EventForecast.tsx:1616 update event_implementations
src/components/EventForecast.tsx:3581 delete event_forecast_partners
src/components/EventForecast.tsx:3587 insert event_forecast_partners
src/components/EventForecast.tsx:3711 update event_forecasts
src/components/EventPartnersTab.tsx:254 update event_settlement_participants
src/components/FeverImportModal.tsx:221 delete ticket_sales
src/components/FeverImportModal.tsx:222 delete event_ticket_lots
src/components/FeverImportModal.tsx:224 delete event_ticket_zones
src/components/FeverImportModal.tsx:324 update event_ticket_lots
src/components/FinancialOperationsTab.tsx:237 insert transaction_audit_log
src/components/LinkReimbursementNoteModal.tsx:128 update transactions
src/components/LinkReimbursementNoteModal.tsx:135 update reimbursement_notes
src/components/LinkReimbursementNoteModal.tsx:84 update transactions
src/components/LinkReimbursementNoteModal.tsx:96 update reimbursement_notes
src/components/MarkInstallmentPaidModal.tsx:118 insert transaction_audit_log
src/components/MfaEnroll.tsx:89 delete mfa_recovery_codes
src/components/MfaEnroll.tsx:92 insert mfa_recovery_codes
src/components/PaymentListsTab.tsx:742 update payment_lists
src/components/PaymentTimeline.tsx:232 insert transaction_audit_log
src/components/ReimbursementNoteDetail.tsx:468 update reimbursement_notes
src/components/SponsorsImportModal.tsx:298 update event_forecasts
src/components/SupplierCreditsPanel.tsx:153 update supplier_credits
src/components/SupplierCreditsPanel.tsx:307 update supplier_credits
src/components/SupplierCreditsPanel.tsx:333 update supplier_credits
src/components/TicketOfficeSalesImport.tsx:505 insert ticket_import_logs
src/components/TicketOfficeSettlementModal.tsx:567 update transactions
src/components/TicketOfficeSettlementModal.tsx:630 update transactions
src/components/TicketOfficeSettlementModal.tsx:654 delete transaction_payments
src/components/TicketOfficeSettlementModal.tsx:664 update transactions
src/components/TicketOfficeSettlementModal.tsx:674 update ticket_office_settlements
src/components/TicketOfficeSettlementModal.tsx:735 update ticket_office_settlements
src/components/TicketOfficeSettlementModal.tsx:756 delete transaction_payments
src/components/TicketOfficeSettlementModal.tsx:766 update transactions
src/components/TicketOfficeSettlementModal.tsx:776 update ticket_office_settlements
src/components/TicketOfficeSettlementModal.tsx:836 update ticket_office_settlements
src/components/TicketOfficeSettlementModal.tsx:844 update event_ticket_office_advances
src/components/TicketOfficeSettlementModal.tsx:852 update event_ticket_office_assignments
src/components/TicketOfficeSettlementsPanel.tsx:128 delete transactions
src/components/TicketOfficeSettlementsPanel.tsx:130 delete transactions
src/components/TicketOfficeSettlementsPanel.tsx:139 delete transaction_payments
src/components/TicketOfficeSettlementsPanel.tsx:140 update transactions
src/components/TicketOfficeSettlementsPanel.tsx:146 update event_ticket_office_advances
src/components/TicketOfficeSettlementsPanel.tsx:165 update event_ticket_office_assignments
src/components/TicketUploadModals.tsx:609 update event_ticket_lots
src/components/TicketUploadModals.tsx:668 insert ticket_import_logs
src/components/TransactionEditModal.tsx:2083 update transactions
src/components/TransactionEditModal.tsx:2278 delete transactions
src/components/TransactionEditModal.tsx:2287 update transactions
src/components/TransactionEditModal.tsx:2288 delete transactions
src/components/TransactionFormModal.tsx:1415 insert transaction_audit_log
src/components/TransactionFormModal.tsx:1645 insert transaction_audit_log
src/components/TransactionFormModal.tsx:1693 insert transaction_audit_log
src/components/TransactionFormModal.tsx:1822 insert transaction_audit_log
src/components/TransactionFormModal.tsx:1833 insert transaction_audit_log
src/components/TransactionPaymentModal.tsx:310 insert transaction_audit_log
src/components/TransactionPaymentModal.tsx:483 insert transaction_audit_log
src/components/TransactionPaymentModal.tsx:599 insert transaction_audit_log
src/components/TransactionPaymentsListModal.tsx:216 insert transaction_audit_log
src/components/TransactionPaymentsListModal.tsx:265 insert transaction_audit_log
src/components/TransferFormModal.tsx:143 insert transaction_audit_log
src/components/bank/BankLineLaunchModal.tsx:625 update bank_line_rules
src/components/bp-versions/ActiveVersionDiffModal.tsx:113 update event_forecasts
src/components/bp-versions/ActiveVersionDiffModal.tsx:118 delete event_forecasts
src/components/bp-versions/ActiveVersionDiffModal.tsx:123 insert event_forecasts
src/components/camarim/CamarimItemAttachmentButton.tsx:85 update camarim_items
src/components/camarim/CamarimItemModal.tsx:183 delete camarim_item_documents
src/components/camarim/CamarimItemModal.tsx:545 delete camarim_items
src/components/camarim/OpenSessionModal.tsx:182 delete camarim_sessions
src/components/camarim/OpenSessionModal.tsx:225 delete camarim_sessions
src/components/camarim/OpenSessionModal.tsx:232 delete camarim_sessions
src/components/camarim/SplitItemModal.tsx:284 delete camarim_items
src/components/cards/NewCardExpenseModal.tsx:454 insert transaction_audit_log
src/components/implementation/ImplBPTab.tsx:1055 insert forecast_audit_log
src/components/implementation/ImplBPTab.tsx:339 insert forecast_audit_log
src/components/implementation/ImplBPTab.tsx:383 insert forecast_audit_log
src/components/implementation/ImplBPTab.tsx:930 insert forecast_audit_log
src/components/implementation/ImplBPTab.tsx:946 insert forecast_audit_log
src/components/implementation/ImplBPTab.tsx:999 insert forecast_audit_log
src/components/operacao/equipa/NewProducerDialog.tsx:59 update profiles
src/components/operacao/event/EventTeamSection.tsx:203 insert event_team_member_zones
src/components/operacao/event/EventTeamSection.tsx:334 delete event_team_member_zones
src/components/operacao/shared/NewProfileInlineDialog.tsx:54 update profiles
src/components/supplier-credits/NewSupplierCreditModal.tsx:105 update supplier_credits
src/hooks/useSyncCacheForecasts.ts:371 update event_forecasts
src/hooks/useSyncCacheForecasts.ts:380 insert event_forecasts
src/hooks/useSyncCacheForecasts.ts:398 delete event_forecasts
src/hooks/useSyncCacheForecasts.ts:411 delete event_forecasts
src/hooks/useSyncCacheForecasts.ts:512 update event_forecasts
src/hooks/useSyncCacheForecasts.ts:520 insert event_forecasts
src/hooks/useSyncCacheForecasts.ts:538 delete event_forecasts
src/hooks/useSyncCacheForecasts.ts:551 delete event_forecasts
src/lib/audit.ts:15 insert system_audit_log
src/lib/card-item-documents.ts:74 update card_session_items
src/lib/card-item-documents.ts:85 update card_session_items
src/lib/delete-transaction-cascade.ts:100 update event_cache_payments
src/lib/delete-transaction-cascade.ts:106 update ticket_office_settlements
src/lib/delete-transaction-cascade.ts:112 update reimbursement_notes
src/lib/delete-transaction-cascade.ts:118 delete payment_list_items
src/lib/delete-transaction-cascade.ts:119 delete reimbursement_note_items
src/lib/delete-transaction-cascade.ts:123 delete partner_paid_expenses
src/lib/delete-transaction-cascade.ts:127 delete partner_advance_expenses
src/lib/delete-transaction-cascade.ts:131 delete supplier_credit_usages
src/lib/delete-transaction-cascade.ts:135 delete transaction_payments
src/lib/delete-transaction-cascade.ts:136 delete transaction_documents
src/lib/delete-transaction-cascade.ts:145 insert transaction_audit_log
src/lib/delete-transaction-cascade.ts:154 insert transaction_audit_log
src/lib/delete-transaction-cascade.ts:164 delete transactions
src/lib/delete-transaction-cascade.ts:89 update event_forecasts
src/lib/delete-transaction-cascade.ts:96 update event_cache_payments
src/lib/event-simulator-sync.ts:334 delete event_simulator_cost_lines
src/lib/event-simulator-sync.ts:360 update event_simulator_config
src/lib/event-simulator-sync.ts:365 insert event_simulator_config
src/lib/import-pl-xlsx.ts:759 update bp_orphan_attachments
src/lib/import-pl-xlsx.ts:892 update event_forecasts
src/lib/operacao-frente-lead.ts:200 update operacao_frentes
src/lib/push-notifications.ts:86 delete push_subscriptions
src/lib/sponsorship-bp-sync.ts:165 delete transactions
src/pages/AccountCategories.tsx:179 update transactions
src/pages/AccountCategories.tsx:180 update event_forecasts
src/pages/AuditoriaContas.tsx:1350 delete event_cache_deductions
src/pages/BankReconciliation.tsx:1256 delete bank_statements
src/pages/BankReconciliation.tsx:1412 delete bank_line_transactions
src/pages/BankReconciliation.tsx:1490 delete bank_line_transactions
src/pages/CardSessionDetail.tsx:480 update card_session_items
src/pages/EventDetail.tsx:1574 insert event_forecasts
src/pages/EventDetail.tsx:597 delete event_dates
src/pages/EventDetail.tsx:598 delete event_forecasts
src/pages/EventDetail.tsx:599 delete event_cache_configs
src/pages/EventDetail.tsx:604 delete event_ticket_lots
src/pages/EventDetail.tsx:605 delete ticket_sales
src/pages/EventDetail.tsx:607 delete event_ticket_zones
src/pages/EventImplementations.tsx:147 update event_implementations
src/pages/EventSimulator.tsx:1887 upsert event_simulator_config
src/pages/EventSimulator.tsx:536 upsert event_simulator_config
src/pages/EventSimulator.tsx:542 upsert event_simulator_inputs
src/pages/EventSimulator.tsx:548 upsert event_simulator_cost_lines
src/pages/EventSimulator.tsx:562 delete event_simulator_inputs
src/pages/EventSimulator.tsx:569 delete event_simulator_cost_lines
src/pages/Events.tsx:327 delete venue_reservations
src/pages/SecurityDashboard.tsx:139 delete mfa_recovery_codes
src/pages/UserManagement.tsx:230 delete user_permissions
src/pages/crm-admin/audiences/audienceSnapshot.ts:118 update audience_snapshots
src/pages/crm-admin/audiences/audienceSnapshot.ts:61 update audiences
src/pages/operacao/ChamadoDetail.tsx:164 insert operacao_registro_media
src/pages/operacao/ChamadoNovo.tsx:78 insert operacao_registro_media
```

## Atualização 10/10/2026 — P1 (#295, D-ERP219)
- delete-transaction-cascade: 15 → RPC delete_transaction_cascade.
- TicketOfficeSettlementsPanel: estorno (6) → RPC reverse_ticket_office_settlement.
- TicketOfficeSettlementModal: 15 com mustWrite (gravação ainda sequencial; RPC pendente).
- EventForecast 13, useSyncCacheForecasts 8, EventDetail 7, ImplBPTab 6, LinkReimbursementNoteModal 4, SupplierCreditsPanel 3, camarim 4 (CamarimItemAttachmentButton 1, CamarimItemModal 2, SplitItemModal 1), card-item-documents 2, BankReconciliation 3: mustWrite.
- OpenSessionModal 3: rollbacks compensatórios, sem verificação de propósito.
- Ficam P2 e P3.
