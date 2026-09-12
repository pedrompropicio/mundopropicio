create table if not exists public.bank_line_transactions (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.bank_statement_lines(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  company_id uuid not null default current_company_id(),
  created_at timestamptz not null default now(),
  unique (line_id, transaction_id)
);

create unique index if not exists uq_bank_line_txn_transaction
  on public.bank_line_transactions (transaction_id);

create index if not exists idx_bank_line_transactions_line
  on public.bank_line_transactions (line_id);

grant select, insert, update, delete on public.bank_line_transactions to authenticated;
grant all on public.bank_line_transactions to service_role;

alter table public.bank_line_transactions enable row level security;

create policy "company_isolation_bank_line_transactions"
  on public.bank_line_transactions
  as restrictive
  for all
  to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy "Bank line transactions manageable by authorized users"
  on public.bank_line_transactions
  for all
  to authenticated
  using (
    is_platform_admin(auth.uid())
    or has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_permission(auth.uid(), 'manage_bank_reconciliation'::text)
  )
  with check (
    is_platform_admin(auth.uid())
    or has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_permission(auth.uid(), 'manage_bank_reconciliation'::text)
  );

create policy "Bank line transactions viewable by authorized users"
  on public.bank_line_transactions
  for select
  to authenticated
  using (
    is_platform_admin(auth.uid())
    or has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_permission(auth.uid(), 'manage_bank_reconciliation'::text)
    or exists (
      select 1
      from public.bank_statement_lines bsl
      join public.financial_account_access faa
        on faa.account_id = bsl.financial_account_id
      where bsl.id = bank_line_transactions.line_id
        and faa.user_id = auth.uid()
    )
  );

comment on table public.bank_line_transactions is
  'Ponte N transações <-> 1 linha do extrato, SÓ para conciliação MANUAL. Lançamentos (created_transaction_id) não entram: são N linhas -> 1 transação e violariam o unique (transaction_id).';