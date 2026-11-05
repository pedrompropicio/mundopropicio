-- Issue #664 E2b — R2 PREPARADA, NÃO APLICADA.
-- Aplicar antes do deploy de sync-coala-from-drive; sem default e sem DML.
ALTER TABLE public.coala_sync_config
  ADD COLUMN new_supplier_country text NULL;

ALTER TABLE public.coala_sync_config
  ADD CONSTRAINT coala_sync_config_new_supplier_country_check
  CHECK (new_supplier_country IS NULL OR new_supplier_country ~ '^[A-Z]{2}$') NOT VALID;

ALTER TABLE public.coala_sync_config
  VALIDATE CONSTRAINT coala_sync_config_new_supplier_country_check;
