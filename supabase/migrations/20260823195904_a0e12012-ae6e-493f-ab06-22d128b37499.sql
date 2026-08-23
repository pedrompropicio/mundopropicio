drop trigger if exists trg_set_company_id on public.email_unsubscribe_tokens;
drop trigger if exists set_company_id_trigger on public.email_unsubscribe_tokens;

drop trigger if exists trg_set_company_id on public.suppressed_emails;
drop trigger if exists set_company_id_trigger on public.suppressed_emails;

alter table public.suppressed_emails
  alter column company_id drop not null;