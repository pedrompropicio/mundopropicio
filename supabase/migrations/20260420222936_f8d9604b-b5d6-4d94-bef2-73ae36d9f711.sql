-- Idempotent: dedup ticket_sales (source='import') and ensure unique index exists.
-- Already applied manually to Live; safe to re-run.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY zone_id, COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid), sale_date, unit_price, financial_account_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.ticket_sales
  WHERE source = 'import'
)
DELETE FROM public.ticket_sales ts
USING ranked r
WHERE ts.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ticket_sales_imported_row
  ON public.ticket_sales (
    zone_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sale_date,
    unit_price,
    financial_account_id
  )
  WHERE source = 'import';