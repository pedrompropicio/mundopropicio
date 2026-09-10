DROP INDEX IF EXISTS public.uq_bank_line_matched_txn;

CREATE UNIQUE INDEX uq_bank_line_matched_txn
ON public.bank_statement_lines (matched_transaction_id)
WHERE matched_transaction_id IS NOT NULL
  AND created_transaction_id IS NULL;

UPDATE public.bank_statement_lines
SET status = 'matched',
    created_transaction_id = 'c30f5a01-f589-42c5-bc21-8200ec6d9d81',
    matched_transaction_id = 'c30f5a01-f589-42c5-bc21-8200ec6d9d81',
    matched_by = 'created:pedroneto@mundopropicio.com',
    matched_at = now()
WHERE financial_account_id = '594befaa-bd40-4858-a59a-aa90b9837c75'
  AND booking_date = '2026-09-07'
  AND description LIKE 'EST-0002TPA%'
  AND status = 'unmatched';