create or replace function public.sync_partner_aporte_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src       record;
  v_acc       record;
  v_partner   record;
  v_cat_id    uuid;
  v_amount    numeric := 0;
  v_bridge_id uuid;
  v_aporte_id uuid;
  v_ret       record;
  v_spec      text;
begin
  if TG_OP = 'DELETE' then v_src := OLD; else v_src := NEW; end if;
  if TG_OP = 'DELETE' then v_ret := OLD; else v_ret := NEW; end if;

  -- Só despesas geram aporte. O aporte espelhado e receita, logo nunca se espelha a si proprio.
  if v_src.type is distinct from 'expense' then
    return v_ret;
  end if;

  select id, aporte_transaction_id into v_bridge_id, v_aporte_id
    from partner_aporte_mirror
   where source_transaction_id = v_src.id;

  if TG_OP <> 'DELETE' then
    select * into v_acc from financial_accounts where id = NEW.account_id;
    if v_acc.id is not null
       and coalesce(v_acc.mirror_partner_aporte, false)
       and v_acc.partner_id is not null
       and NEW.status = 'paid'
       and NEW.reversed_at is null
    then
      v_amount := coalesce(NEW.paid_amount, 0);
    end if;
  end if;

  -- Nada a fazer
  if v_amount <= 0 and v_bridge_id is null then
    return v_ret;
  end if;

  -- Deixou de haver aporte: apagar o espelho (a ponte e o movimento de capital caem por cascata)
  if v_amount <= 0 then
    delete from transactions where id = v_aporte_id;
    return v_ret;
  end if;

  select * into v_partner from event_partners where id = v_acc.partner_id;
  select id into v_cat_id from account_categories
   where company_id = NEW.company_id and code = '10.1.01' limit 1;
  if v_cat_id is null then
    raise exception 'Conta-espelho: rubrica 10.1.01 nao existe na empresa %', NEW.company_id;
  end if;

  v_spec := 'Aporte automático do sócio, gerado pela conta-espelho '
            || coalesce(v_acc.name, '(conta sem nome)')
            || '. Espelha a despesa ' || NEW.id || '.';

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, specification, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method
    ) values (
      NEW.company_id, 'income',
      NEW.description, v_spec,
      v_amount, v_amount, 0,
      coalesce(NEW.payment_date, NEW.date), coalesce(NEW.payment_date, NEW.date), 'paid',
      NEW.account_id, v_partner.event_id, v_partner.supplier_id,
      v_cat_id, 'transfer'
    ) returning id into v_aporte_id;

    insert into partner_aporte_mirror
      (company_id, account_id, source_transaction_id, aporte_transaction_id)
    values (NEW.company_id, NEW.account_id, NEW.id, v_aporte_id);

    insert into partner_capital_moves
      (company_id, event_id, partner_id, transaction_id, kind, flow)
    values (NEW.company_id, v_partner.event_id, v_acc.partner_id, v_aporte_id,
            'aporte', 'partner_settlement');
  else
    update transactions set
      description   = NEW.description,
      specification = v_spec,
      amount        = v_amount,
      paid_amount   = v_amount,
      date          = coalesce(NEW.payment_date, NEW.date),
      payment_date  = coalesce(NEW.payment_date, NEW.date),
      account_id    = NEW.account_id,
      event_id      = v_partner.event_id,
      supplier_id   = v_partner.supplier_id,
      updated_at    = now()
    where id = v_aporte_id;

    update partner_aporte_mirror
       set account_id = NEW.account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$$;