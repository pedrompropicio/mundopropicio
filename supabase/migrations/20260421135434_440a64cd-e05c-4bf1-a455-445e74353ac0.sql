-- Limpar com TRUNCATE CASCADE as 3 tabelas que falharam no restore + dependentes
-- TRUNCATE ignora FKs e é a forma mais segura de garantir tabela vazia.
TRUNCATE TABLE 
  forecast_audit_log,
  event_forecasts,
  ticket_sales,
  transaction_payments,
  transaction_documents,
  transaction_audit_log,
  transactions,
  partner_paid_expenses,
  payment_list_items,
  payment_lists,
  reimbursement_note_items,
  reimbursement_notes,
  event_forecast_partners,
  ticket_import_logs
RESTART IDENTITY CASCADE;