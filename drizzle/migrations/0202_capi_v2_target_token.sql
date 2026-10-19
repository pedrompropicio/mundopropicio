ALTER TABLE public.capi_v2_targets
  ADD COLUMN token_secret_name text NULL;

COMMENT ON COLUMN public.capi_v2_targets.token_secret_name IS
  'Nome do segredo (vault/env) com o token CAPI deste target. NULL = META_CAPI_ACCESS_TOKEN (por omissão).';