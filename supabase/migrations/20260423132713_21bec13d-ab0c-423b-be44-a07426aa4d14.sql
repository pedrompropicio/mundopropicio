create or replace function public.protect_master_split_forecast_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_split_children boolean := false;
  has_child_transactions boolean := false;
  old_master_transaction_id uuid := old.transaction_id;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select exists (
    select 1
    from public.events se
    where se.parent_event_id = old.event_id
  ) into has_split_children;

  if has_split_children and old.type = 'expense' then
    if old_master_transaction_id is not null
       and new.transaction_id is distinct from old_master_transaction_id then
      select exists (
        select 1
        from public.transactions t
        join public.events se on se.id = t.event_id
        where se.parent_event_id = old.event_id
          and t.parent_transaction_id = old_master_transaction_id
      ) into has_child_transactions;

      if has_child_transactions then
        raise exception 'Não é permitido alterar/remover transaction_id de um BP Master com transações-filhas vinculadas nos subeventos';
      end if;
    end if;
  end if;

  if old.master_forecast_id is not null
     and new.master_forecast_id is distinct from old.master_forecast_id then
    raise exception 'Não é permitido alterar/remover master_forecast_id de uma linha-filha já vinculada a um rateio Master';
  end if;

  if old.master_forecast_id is not null
     and old.transaction_id is not null
     and new.transaction_id is distinct from old.transaction_id then
    raise exception 'Não é permitido alterar/remover transaction_id de uma linha-filha já vinculada a um rateio Master';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_master_split_forecast_links on public.event_forecasts;

create trigger trg_protect_master_split_forecast_links
before update on public.event_forecasts
for each row
execute function public.protect_master_split_forecast_links();