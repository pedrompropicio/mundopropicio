create table if not exists public.bank_line_documents (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.bank_statement_lines(id) on delete cascade,
  name text not null,
  file_url text not null,
  doc_type text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  company_id uuid not null default current_company_id()
);

create index if not exists idx_bank_line_documents_line on public.bank_line_documents (line_id);

comment on table public.bank_line_documents is
  'Documentos anexados a uma LINHA do extrato bancário. Necessário quando um crédito único cobre N transações de eventos diferentes (a fatura não pode viver nas transações por causa do rateio e da vista do sócio). Ficheiros no bucket privado bank-statements, prefixo <company_id>/line-documents/<line_id>/.';

grant select, insert, update, delete on public.bank_line_documents to authenticated;
grant all on public.bank_line_documents to service_role;

alter table public.bank_line_documents enable row level security;

create policy "Bank line documents viewable by authenticated"
  on public.bank_line_documents for select to authenticated
  using (auth.uid() is not null);

create policy "Bank line documents insertable by privileged roles"
  on public.bank_line_documents for insert to authenticated
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_role(auth.uid(), 'editor'::app_role)
  );

create policy "Bank line documents updatable by admin or manager"
  on public.bank_line_documents for update to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role));

create policy "Bank line documents deletable by admin or manager"
  on public.bank_line_documents for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role));

create policy "company_isolation_bank_line_documents"
  on public.bank_line_documents as restrictive for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create trigger trg_set_company_id
  before insert on public.bank_line_documents
  for each row execute function public.set_company_id_on_insert();