alter table public.ads_invoice_line
  add column if not exists matched_by uuid,
  add column if not exists matched_at timestamptz;

alter table public.ads_invoice
  add column if not exists reopened_by uuid,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_count integer not null default 0;