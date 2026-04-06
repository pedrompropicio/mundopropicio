
ALTER TABLE public.suppliers
  ADD COLUMN iban_2 text DEFAULT NULL,
  ADD COLUMN swift_bic_2 text DEFAULT NULL,
  ADD COLUMN iban_3 text DEFAULT NULL,
  ADD COLUMN swift_bic_3 text DEFAULT NULL;
