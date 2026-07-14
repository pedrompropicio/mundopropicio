CREATE UNIQUE INDEX IF NOT EXISTS transactions_active_installment_unique_idx
ON public.transactions (
  company_id,
  COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid),
  type,
  COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
  description,
  due_date,
  amount,
  iva_rate
)
WHERE due_date IS NOT NULL
  AND description ~ '[[:space:]]\([0-9]+/[0-9]+\)[[:space:]]*$'
  AND COALESCE(is_hidden, false) = false
  AND status <> 'reversed';