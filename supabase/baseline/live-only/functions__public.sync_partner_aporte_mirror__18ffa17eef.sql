-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.sync_partner_aporte_mirror()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "ed06c61caf284739487008b9c977754961f24e92c6c04f7bfb6d61c8f8f202da", "live_properties_sha256": "a92219df5af30f7dbad5eeef84865952de69047aec06c32873ce209b31c5755d", "oid": 208134, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "02b868f26a8146d08575eca697eb270bb4c560be1d920e7081f89a69adfbcce4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION c7bb6bc331e81180c293aefbf8b72e8d749f3678eb6ffcea2a402e9598c3a2e3
CREATE OR REPLACE FUNCTION public.sync_partner_aporte_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src       record;
  v_acc       record;
  v_partner   record;
  v_cat_id    uuid;
  v_amount    numeric := 0;
  v_bridge_id uuid;
  v_aporte_id uuid;
  v_ret       record;
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

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method
    ) values (
      NEW.company_id, 'income',
      'Aporte automatico — ' || NEW.description,
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
      description  = 'Aporte automatico — ' || NEW.description,
      amount       = v_amount,
      paid_amount  = v_amount,
      date         = coalesce(NEW.payment_date, NEW.date),
      payment_date = coalesce(NEW.payment_date, NEW.date),
      account_id   = NEW.account_id,
      event_id     = v_partner.event_id,
      supplier_id  = v_partner.supplier_id,
      updated_at   = now()
    where id = v_aporte_id;

    update partner_aporte_mirror
       set account_id = NEW.account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$function$
;

ALTER FUNCTION public.sync_partner_aporte_mirror() OWNER TO "postgres";
-- END OPERATION c7bb6bc331e81180c293aefbf8b72e8d749f3678eb6ffcea2a402e9598c3a2e3
