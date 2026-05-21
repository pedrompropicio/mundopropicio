ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_access_token uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_access_consumed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_operacao_only boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_first_access_token_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_first_access_token_key UNIQUE (first_access_token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_first_access_token
  ON public.profiles (first_access_token)
  WHERE first_access_token IS NOT NULL;