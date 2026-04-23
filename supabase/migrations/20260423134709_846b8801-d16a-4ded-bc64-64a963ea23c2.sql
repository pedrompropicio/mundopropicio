create or replace function public.protect_master_split_forecast_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_split_children boolean := false;
  has_child_transactions boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.type <> 'expense' then
    return new;
  end if;

  if old.transaction_id is null or new.transaction_id is not distinct from old.transaction_id then
    return new;
  end if;

  select exists (
    select 1
    from public.events se
    where se.parent_event_id = old.event_id
  ) into has_split_children;

  if not has_split_children then
    return new;
  end if;

  select exists (
    select 1
    from public.transactions t
    join public.events se on se.id = t.event_id
    where se.parent_event_id = old.event_id
      and t.parent_transaction_id = old.transaction_id
  ) into has_child_transactions;

  if has_child_transactions then
    raise exception 'Não é permitido alterar/remover transaction_id de um BP Master com transações-filhas vinculadas nos subeventos';
  end if;

  return new;
end;
$$;