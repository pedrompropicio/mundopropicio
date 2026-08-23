-- O token de unsubscribe é por endereço de email (unique em `email`),
-- não por tenant. Sob service_role current_company_id() devolve NULL,
-- o que fazia falhar todos os envios para endereços novos.
alter table public.email_unsubscribe_tokens
  alter column company_id drop not null;
