-- #352 corrective local iteration, native run40119543266 SQLSTATE42703.
-- Original migration unchanged. No seed, no Live application.
-- Required column definition from repository snapshot: supabase/tests/issue335/live/phase2h-catalog-ddl.json
-- Snapshot SHA256: 1c85fef0b728c92bf921404279d5e401e0d1172a498fb7503b068cb402709d6d; key table:public.ticket_sales (zone_id uuid, nullable).
-- Column also confirmed in SELECT catalogue24/10/2026; no inferred operational rows.
-- Iterative correction by Codex, pending Claude final review; not a promoted G3 migration.
ALTER TABLE public.ticket_sales ADD COLUMN IF NOT EXISTS zone_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ticket_sales_imported_row ON public.ticket_sales (zone_id, COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid), sale_date, unit_price, financial_account_id) WHERE source = 'import';
