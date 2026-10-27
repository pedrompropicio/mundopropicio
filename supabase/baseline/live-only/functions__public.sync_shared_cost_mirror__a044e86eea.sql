-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.sync_shared_cost_mirror()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "6a12eb779a5d176fb7db73a36c5ab7f33aec25b233d60a008244ed14464c31ba", "live_properties_sha256": "1aeb893c3ec7e97c1e86aff433b21b6fd35036d6d176e3dd179151267fcdd9bc", "oid": 225795, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "2c2b2fce1a8918d5febba90f815161410720c19bee91d5be3a1150f5ddaa57d9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 59ce9c1f58d31a791a2cb2b5362680393e8dbf386fa264b783ebd197835ce4cc
CREATE OR REPLACE FUNCTION public.sync_shared_cost_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src        record;
  v_ret        record;
  v_bridge_id  uuid;
  v_mirror_id  uuid;
  v_amount     numeric := 0;
  v_cat_id     uuid;
begin
  if TG_OP = 'DELETE' then v_src := OLD; v_ret := OLD; else v_src := NEW; v_ret := NEW; end if;

  -- Guarda anti-recursao: o proprio espelho nunca dispara logica de espelho.
  if exists (select 1 from shared_cost_mirror where mirror_transaction_id = v_src.id) then
    return v_ret;
  end if;

  select id, mirror_transaction_id into v_bridge_id, v_mirror_id
    from shared_cost_mirror
   where source_transaction_id = v_src.id;

  if TG_OP <> 'DELETE'
     and NEW.type = 'expense'
     and NEW.shared_cost_account_id is not null
     and NEW.status = 'paid'
     and NEW.reversed_at is null
  then
    v_amount := coalesce(NEW.paid_amount, 0);
  end if;

  -- Nada a fazer
  if v_amount <= 0 and v_bridge_id is null then
    return v_ret;
  end if;

  -- Deixou de haver adiantamento: apagar o espelho (a ponte cai por cascata)
  if v_amount <= 0 then
    delete from transactions where id = v_mirror_id;
    return v_ret;
  end if;

  select id into v_cat_id from account_categories
   where company_id = NEW.company_id and code = '10.12.01' limit 1;
  if v_cat_id is null then
    raise exception 'Custo partilhado: rubrica 10.12.01 nao existe na empresa %', NEW.company_id;
  end if;

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method, exclude_from_result
    ) values (
      NEW.company_id, 'income',
      'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      v_amount, v_amount, 0,
      NEW.date, NEW.payment_date, 'paid',
      NEW.shared_cost_account_id, null, NEW.shared_cost_counterparty_id,
      v_cat_id, 'transfer', true
    ) returning id into v_mirror_id;

    insert into shared_cost_mirror
      (company_id, account_id, source_transaction_id, mirror_transaction_id)
    values (NEW.company_id, NEW.shared_cost_account_id, NEW.id, v_mirror_id);
  else
    update transactions set
      description  = 'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      amount       = v_amount,
      paid_amount  = v_amount,
      date         = NEW.date,
      payment_date = NEW.payment_date,
      account_id   = NEW.shared_cost_account_id,
      supplier_id  = NEW.shared_cost_counterparty_id,
      updated_at   = now()
    where id = v_mirror_id;

    update shared_cost_mirror
       set account_id = NEW.shared_cost_account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$function$
;

ALTER FUNCTION public.sync_shared_cost_mirror() OWNER TO "postgres";
-- END OPERATION 59ce9c1f58d31a791a2cb2b5362680393e8dbf386fa264b783ebd197835ce4cc
