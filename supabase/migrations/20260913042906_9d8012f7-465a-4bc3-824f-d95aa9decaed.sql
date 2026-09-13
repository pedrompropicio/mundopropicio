ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS doc_locale text NOT NULL DEFAULT 'pt-PT';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_doc_locale_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_doc_locale_check CHECK (doc_locale IN ('pt-PT','pt-BR'));

COMMENT ON COLUMN public.suppliers.doc_locale IS
  'Épica #146 (g4): idioma dos documentos de prestação de contas do sócio (pt-PT | pt-BR).';