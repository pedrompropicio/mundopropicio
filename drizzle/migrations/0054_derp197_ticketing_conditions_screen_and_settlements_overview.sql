-- D-ERP197 + #271. Cálculo único das condições da vigia; vigia deixa de escrever lembretes;
-- ecrã lê por RPC isolada por empresa; vista de fechos por evento/transversal.

CREATE OR REPLACE FUNCTION public.ticketing_sync_conditions()
RETURNS TABLE(company_id uuid, config_id uuid, event_id uuid, event_name text, bilheteira text,
              condicao text, nivel text, detalhe text, desde_quando text, last_ok timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  with cfg as (
    select 'ticketline'::text as src, 'Ticketline'::text as label, c.id, c.company_id, c.enabled, e.id as event_id, e.name as event_name
      from public.ticketline_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
    union all
    select 'bol', 'BOL', c.id, c.company_id, c.enabled, e.id, e.name
      from public.bol_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
    union all
    select 'coala', 'Coala', c.id, c.company_id, c.enabled, e.id, e.name
      from public.coala_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
    union all
    select 'fever', 'Fever', c.id, c.company_id, c.enabled, e.id, e.name
      from public.fever_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
    union all
    select 'onebox', 'Onebox', e.id, e.company_id, true, e.id, e.name
      from public.events e where e.id = 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid and e.date >= current_date
  ),
  runs as (
    select 'ticketline'::text as src, r.config_id, r.status, r.started_at, r.error_message from public.ticketline_sync_runs r
    union all select 'bol', r.config_id, r.status, r.started_at, r.error_message from public.bol_sync_runs r
    union all select 'coala', r.config_id, r.status, r.started_at, r.error_message from public.coala_sync_runs r
    union all select 'fever', r.config_id, r.status, r.started_at, r.error_message from public.fever_sync_runs r
    union all select 'onebox', 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid, r.status, r.started_at, r.error_message from public.onebox_sync_runs r
  ),
  ranked as (
    select k.*, row_number() over (partition by k.src, k.config_id order by k.started_at desc) as rn from runs k
  ),
  agg as (
    select cfg.*,
      (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3) as n3,
      (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3
          and k.status not in ('success','warning','skipped')) as bad3,
      (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 6) as n6,
      (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 6
          and k.status is distinct from 'success') as notok6,
      (select max(k.started_at) from ranked k where k.src = cfg.src and k.config_id = cfg.id
          and k.status in ('success','warning')) as lok,
      (select k.error_message from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_error,
      (select k.status from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_status
    from cfg
  ),
  cond as (
    select a.*, case
        when not a.enabled then 'c'
        when a.n3 = 3 and a.bad3 = 3 then 'a'
        when a.n6 = 6 and a.notok6 = 6 then 'f'
        when a.lok is null or a.lok < now() - interval '6 hours' then 'b'
      end as cnd
    from agg a
  ),
  cap as (
    select max(started_at) as t from public.ticketline_sync_runs
     where triggered_by like 'capture_day:%' and status = 'success'
  )
  select c.company_id, c.id, c.event_id, c.event_name, c.label, c.cnd,
         case when c.cnd = 'c' then 'info' else 'vermelho' end,
         case when c.cnd = 'c' then 'Import desligado (enabled = false)'
              else coalesce(nullif(c.last_status,'') || ': ' || coalesce(c.last_error,'sem mensagem'), 'sem corridas registadas') end,
         case when c.lok is null then 'nunca' else to_char(c.lok at time zone 'Europe/Lisbon','DD/MM/YYYY HH24:MI') end,
         c.lok
    from cond c where c.cnd is not null
  union all
  select distinct c.company_id, null::uuid, null::uuid, 'Todos os eventos Ticketline', 'Ticketline', 'd', 'vermelho',
         'Sem corrida capture_day com sucesso nas últimas 3 horas',
         case when cap.t is null then 'nunca' else to_char(cap.t at time zone 'Europe/Lisbon','DD/MM/YYYY HH24:MI') end,
         cap.t
    from public.ticketline_sync_config c join public.events e on e.id = c.event_id cross join cap
   where c.enabled and e.date >= current_date and c.company_id is not null
     and (cap.t is null or cap.t < now() - interval '3 hours')
  union all
  select s.company_id, s.config_id, s.event_id, s.event_name, 'Ticketline', 'e', 'ambar',
         format('Variação diária do Mapa de Ocupação (xlsx) diferente da nossa em 3 dias seguidos: %s', s.series),
         to_char(s.as_of,'DD/MM/YYYY'), null::timestamptz
    from public.ticketline_crosscheck_signals() s where s.cond_e
  union all
  select s.company_id, s.config_id, s.event_id, s.event_name, 'Ticketline', 'g', 'ambar',
         format('PDF do portal mexeu %s bilhetes em 3 dias enquanto o xlsx do mesmo evento mexeu %s (nossas vendas: %s). Problema do fornecedor: %s',
           s.sum_pdf, s.sum_xlsx, s.sum_ours, s.series),
         to_char(s.as_of,'DD/MM/YYYY'), null::timestamptz
    from public.ticketline_crosscheck_signals() s where s.cond_g
$$;
REVOKE ALL ON FUNCTION public.ticketing_sync_conditions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_sync_conditions() TO service_role;

-- Ecrã: todas as condições, só da empresa activa.
CREATE OR REPLACE FUNCTION public.get_ticketing_sync_status()
RETURNS TABLE(config_id uuid, event_id uuid, event_name text, bilheteira text,
              condicao text, nivel text, detalhe text, desde_quando text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  select c.config_id, c.event_id, c.event_name, c.bilheteira, c.condicao, c.nivel, c.detalhe, c.desde_quando
    from public.ticketing_sync_conditions() c
   where public.row_belongs_to_current_company(c.company_id)
   order by case c.nivel when 'vermelho' then 0 when 'ambar' then 1 else 2 end, c.event_name
$$;
REVOKE ALL ON FUNCTION public.get_ticketing_sync_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticketing_sync_status() TO authenticated, service_role;

-- Vigia: mesma detecção, sem system_reminders (D-ERP197).
CREATE OR REPLACE FUNCTION public.check_ticketing_sync_health(_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
declare
  v_items jsonb;
  v_alerts jsonb;
  v_recipients text[];
  v_last_notified timestamptz;
  v_run_at text := to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_company uuid;
  v_company_alerts jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_status text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('evento', c.event_name, 'bilheteira', c.bilheteira, 'condicao', c.condicao,
           'nivel', c.nivel, 'detalhe', c.detalhe, 'desdeQuando', c.desde_quando,
           'config_id', c.config_id, 'company_id', c.company_id)), '[]'::jsonb)
    into v_items from public.ticketing_sync_conditions() c;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alerts
    from jsonb_array_elements(v_items) x where x->>'condicao' <> 'c';

  if exists (select 1 from jsonb_array_elements(v_items) x where x->>'company_id' is null) then
    raise warning 'check_ticketing_sync_health: itens sem company_id';
    if not _dry_run then
      insert into public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
      values ('ticketing_sync_health','check_ticketing_sync_health','missing_company','sistema',
              jsonb_build_object('run_at', v_run_at,
                'itens', (select jsonb_agg(x) from jsonb_array_elements(v_items) x where x->>'company_id' is null)));
    end if;
  end if;

  for v_company in
    select distinct (x->>'company_id')::uuid from jsonb_array_elements(v_items) x where x->>'company_id' is not null
  loop
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_company_alerts
      from jsonb_array_elements(v_alerts) x where (x->>'company_id')::uuid = v_company;

    select array_agg(distinct lower(p.email) order by lower(p.email)) into v_recipients
      from public.user_roles ur join public.profiles p on p.id = ur.user_id
     where ur.company_id = v_company and ur.role in ('admin','manager','platform_admin')
       and p.email is not null and p.email <> '';

    select last_notified_at into v_last_notified from public.sync_notifications_sent
     where config_id = v_company and sync_type = 'health_company_daily';

    v_status := case
      when jsonb_array_length(v_company_alerts) = 0 then 'sem_alertas_email'
      when v_last_notified is not null and (v_last_notified at time zone 'Europe/Lisbon')::date >= v_today then 'ja_enviado_hoje'
      when v_recipients is null or array_length(v_recipients,1) is null then 'sem_destinatarios'
      else 'enviar' end;

    v_plan := v_plan || jsonb_build_object('company_id', v_company,
      'recipients', to_jsonb(coalesce(v_recipients,'{}'::text[])),
      'itens', v_company_alerts, 'status', v_status, 'idempotency_day', to_char(v_today,'YYYYMMDD'));
  end loop;

  return jsonb_build_object('run_at', v_run_at, 'dry_run', _dry_run, 'items', v_items,
    'plano_por_empresa', v_plan,
    'emails_que_sairiam', (select coalesce(sum(jsonb_array_length(p->'recipients')),0)
                             from jsonb_array_elements(v_plan) p where p->>'status' = 'enviar'));
end;
$function$;
REVOKE ALL ON FUNCTION public.check_ticketing_sync_health(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health(boolean) TO service_role;

-- #271: fechos de bilheteira por evento e transversal, com forma de liquidação derivada.
CREATE OR REPLACE FUNCTION public.get_ticket_office_settlements_overview(_event_id uuid DEFAULT NULL, _office_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, event_id uuid, event_name text, office_id uuid, office_name text, settlement_date date,
              status text, gross_revenue numeric, total_deductions numeric, net_value numeric, net_transferred numeric,
              forma_liquidacao text, notes text, adjustment_notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  select s.id, s.event_id, e.name, s.financial_account_id, fa.name, s.settlement_date, s.status,
         s.gross_revenue, s.total_deductions, coalesce(s.net_adjusted, s.net_calculated), s.net_transferred,
         case
           when s.transfer_transaction_id is not null then 'transferencia'
           when abs(coalesce(s.net_adjusted, s.net_calculated, 0)) < 0.01 then 'compensado'
           when coalesce(s.net_transferred, 0) > 0 then 'encontro_de_contas'
           else 'por_liquidar'
         end,
         s.notes, s.adjustment_notes
    from public.ticket_office_settlements s
    left join public.events e on e.id = s.event_id
    left join public.financial_accounts fa on fa.id = s.financial_account_id
   where public.row_belongs_to_current_company(s.company_id)
     and (_event_id is null or s.event_id = _event_id or e.parent_event_id = _event_id)
     and (_office_id is null or s.financial_account_id = _office_id)
   order by s.settlement_date desc nulls last, s.created_at desc
$$;
REVOKE ALL ON FUNCTION public.get_ticket_office_settlements_overview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_office_settlements_overview(uuid, uuid) TO authenticated, service_role;