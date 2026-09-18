-- #211 parte 2 — cancelamento de subscricao POR EMPRESA.
-- Verificado em Live a 2026-09-18: 0 linhas com company_id nulo (403 tokens).
-- O indice unico (email, company_id) NULLS NOT DISTINCT mantem-se.
alter table public.email_unsubscribe_tokens
  alter column company_id set not null;