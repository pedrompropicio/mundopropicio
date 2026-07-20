ALTER TABLE public.redirect_log ADD COLUMN IF NOT EXISTS destination_url text;

COMMENT ON COLUMN public.redirect_log.destination_url IS 'URL completo de destino (bilheteira) para onde o utilizador foi redirecionado, incluindo query string com fbclid quando presente. Usado para auditoria de propagação cross-domain do fbclid.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'redirect_log'
      AND column_name = 'destination_url'
  ) THEN
    RAISE EXCEPTION 'Coluna destination_url não foi criada';
  END IF;
END
$$;