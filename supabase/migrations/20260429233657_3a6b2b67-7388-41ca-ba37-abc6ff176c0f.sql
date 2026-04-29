-- Account categories: code must be unique per company (multi-tenant), not global
ALTER TABLE public.account_categories
  DROP CONSTRAINT IF EXISTS account_categories_code_key;

ALTER TABLE public.account_categories
  ADD CONSTRAINT account_categories_company_code_key UNIQUE (company_id, code);