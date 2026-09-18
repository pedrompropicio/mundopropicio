CREATE OR REPLACE FUNCTION public.check_ticketing_sync_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_items jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_alert_keys jsonb := '[]'::jsonb;
  v_email_items jsonb := '[]'::jsonb;
  v_email_keys jsonb := '[]'::jsonb;
  v_lines text := '';
  v_msg text;
  v_cond text;
  v_detail text;
  v_since text;
  v_has_tl_enabled boolean;
  v_capture_last timestamptz;
  v_service_role text;
  v_cc text;
  v_recipients text[];
  v_email text;
  v_last_notified timestamptz;
  v_k jsonb;
  v_i jsonb;
  v_sent int := 0;
  v_run_at text := to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  v_capture_config_id uuid := 'd7f4efc8-ab89-4357-a9ee-113eb28d8e7c';
  v_company uuid;
  v_company_items jsonb;
  v_req_id bigint;
  v_requests jsonb := '[]'::jsonb;
begin
  for r in
    with cfg as (
      select 'ticketline'::text as src, 'Ticketline'::text as label,
             c.id, c.company_id, c.enabled, e.name as event_name
        from public.ticketline_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'bol'::text, 'BOL'::text, c.id, c.company_id, c.enabled, e.name
        from public.bol_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'coala'::text, 'Coala'::text, c.id, c.company_id, c.enabled, e.name
        from public.coala_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'fever'::text, 'Fever'::text, c.id, c.company_id, c.enabled, e.name
        from public.fever_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
    ),
    runs as (
      select 'ticketline'::text as src, config_id, status, started_at, error_message
        from public.ticketline_sync_runs
      union all
      select 'bol'::text, config_id, status, started_at, error_message from public.bol_sync_runs
      union all
      select 'coala'::text, config_id, status, started_at, error_message from public.coala_sync_runs
      union all
      select 'fever'::text, config_id, status, started_at, error_message from public.fever_sync_runs
    ),
    ranked as (
      select src, config_id, status, started_at, error_message,
             row_number() over (partition by src, config_id order by started_at desc) as rn
        from runs
    )
    select cfg.src, cfg.label, cfg.id, cfg.company_id, cfg.enabled, cfg.event_name,
           (select count(*) from ranked k
             where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3) as n3,
           (select count(*) from ranked k
             where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3
               and k.status not in ('success','warning','skipped')) as bad3,
           (select max(k.started_at) from ranked k
             where k.src = cfg.src and k.config_id = cfg.id
               and k.status in ('success','warning')) as last_ok,
           (select k.error_message from ranked k
             where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_error,
           (select k.status from ranked k
             where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_status
      from cfg
     order by cfg.src, cfg.event_name
  loop
    v_cond := null;
    if not r.enabled then
      v_cond := 'c';
    elsif r.n3 = 3 and r.bad3 = 3 then
      v_cond := 'a';
    elsif r.last_ok is null or r.last_ok < now() - interval '6 hours' then
      v_cond := 'b';
    end if;
    if v_cond is null then
      continue;
    end if;

    v_detail := case
      when v_cond = 'c' then 'Import desligado (enabled = false)'
      else coalesce(nullif(r.last_status,'') || ': ' || coalesce(r.last_error,'sem mensagem'),
                    'sem corridas registadas')
    end;
    v_since := case
      when r.last_ok is null then 'nunca'
      else to_char(r.last_ok at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI')
    end;

    v_items := v_items || jsonb_build_object(
      'evento', r.event_name, 'bilheteira', r.label, 'condicao', v_cond,
      'detalhe', v_detail, 'desdeQuando', v_since,
      'config_id', r.id, 'company_id', r.company_id);

    v_lines := v_lines || format('%s · %s · condição (%s) · último sucesso %s · %s',
      r.event_name, r.label, v_cond, v_since, v_detail) || E'\n';

    if v_cond in ('a','b') then
      v_alerts := v_alerts || jsonb_build_object(
        'evento', r.event_name, 'bilheteira', r.label, 'condicao', v_cond,
        'detalhe', v_detail, 'desdeQuando', v_since, 'company_id', r.company_id);
      v_alert_keys := v_alert_keys || jsonb_build_object(
        'config_id', r.id, 'sync_type', r.src || '_health');
    end if;
  end loop;

  select exists (
    select 1 from public.ticketline_sync_config c
      join public.events e on e.id = c.event_id
     where c.enabled and e.date >= current_date
  ) into v_has_tl_enabled;

  if v_has_tl_enabled then
    select max(started_at) into v_capture_last
      from public.ticketline_sync_runs
     where triggered_by like 'capture_day:%' and status = 'success';

    if v_capture_last is null or v_capture_last < now() - interval '3 hours' then
      v_since := case when v_capture_last is null then 'nunca'
                      else to_char(v_capture_last at time zone 'Europe/Lisbon','DD/MM/YYYY HH24:MI') end;

      for r in
        select distinct c.company_id
          from public.ticketline_sync_config c
          join public.events e on e.id = c.event_id
         where c.enabled and e.date >= current_date and c.company_id is not null
      loop
        v_items := v_items || jsonb_build_object(
          'evento', 'Todos os eventos Ticketline', 'bilheteira', 'Ticketline',
          'condicao', 'd', 'detalhe', 'Sem corrida capture_day com sucesso nas últimas 3 horas',
          'desdeQuando', v_since, 'company_id', r.company_id);
        v_alerts := v_alerts || jsonb_build_object(
          'evento', 'Todos os eventos Ticketline', 'bilheteira', 'Ticketline',
          'condicao', 'd', 'detalhe', 'Sem corrida capture_day com sucesso nas últimas 3 horas',
          'desdeQuando', v_since, 'company_id', r.company_id);
        v_alert_keys := v_alert_keys || jsonb_build_object(
          'config_id', v_capture_config_id, 'sync_type', 'ticketline_capture');
      end loop;

      v_lines := v_lines || format('Captura horária Ticketline · condição (d) · último sucesso %s', v_since) || E'\n';
    end if;
  end if;

  if jsonb_array_length(v_items) > 0 then
    v_msg := 'Sincronização de bilheteira a precisar de atenção:' || E'\n' || v_lines
      || E'\n' || '(a) falha persistente · (b) parado >6h · (c) desligado · (d) captura horária parada';

    insert into public.system_reminders (key, title, message, due_date, frequency, link_url, is_active)
    values ('ticketing_sync_stalled', 'Sync de bilheteira precisa de atenção',
            v_msg, current_date, 'daily', '/bilheteiras', true)
    on conflict (key) do update
      set title = excluded.title, message = excluded.message,
          due_date = current_date, is_active = true,
          updated_at = now(), completed_at = null;
  else
    update public.system_reminders
       set is_active = false, completed_at = now(), updated_at = now()
     where key = 'ticketing_sync_stalled' and is_active;
  end if;

  for i in 0 .. greatest(jsonb_array_length(v_alerts) - 1, -1) loop
    v_k := v_alert_keys -> i;
    v_i := v_alerts -> i;
    if v_k is null then continue; end if;

    select last_notified_at into v_last_notified
      from public.sync_notifications_sent
     where config_id = (v_k->>'config_id')::uuid
       and sync_type = (v_k->>'sync_type');

    if v_last_notified is not null and v_last_notified > now() - interval '12 hours' then
      continue;
    end if;

    v_email_items := v_email_items || v_i;
    v_email_keys := v_email_keys || v_k;
  end loop;

  if jsonb_array_length(v_email_items) > 0 then
    begin
      select decrypted_secret into v_service_role
        from vault.decrypted_secrets
       where name = 'email_queue_service_role_key'
       limit 1;

      if v_service_role is null then
        raise exception 'segredo email_queue_service_role_key ausente no vault';
      end if;

      select array_agg(distinct lower(p.email)) into v_recipients
        from public.user_roles ur
        join public.profiles p on p.id = ur.user_id
       where ur.role in ('admin','manager','platform_admin')
         and p.email is not null and p.email <> '';

      if v_recipients is null or array_length(v_recipients,1) = 0 then
        select decrypted_secret into v_cc
          from vault.decrypted_secrets
         where name = 'BILHETEIRA_SYNC_NOTIFY_CC'
         limit 1;
        if v_cc is null or v_cc = '' then
          raise exception 'sem destinatários: nenhum admin/manager com email e BILHETEIRA_SYNC_NOTIFY_CC ausente';
        end if;
        v_recipients := array[lower(v_cc)];
      end if;

      for v_company in
        select distinct (x->>'company_id')::uuid
          from jsonb_array_elements(v_email_items) x
         where x->>'company_id' is not null
      loop
        select coalesce(jsonb_agg(x), '[]'::jsonb) into v_company_items
          from jsonb_array_elements(v_email_items) x
         where (x->>'company_id')::uuid = v_company;

        foreach v_email in array v_recipients loop
          select net.http_post(
            url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/send-transactional-email',
            headers := jsonb_build_object(
              'Content-Type','application/json',
              'Authorization','Bearer ' || v_service_role),
            body := jsonb_build_object(
              'templateName','ticketing-sync-alert',
              'recipientEmail', v_email,
              'companyId', v_company,
              'idempotencyKey', 'ticketing-sync-health-' || v_company::text || '-' || v_email || '-'
                || to_char(now() at time zone 'UTC','YYYYMMDDHH24'),
              'templateData', jsonb_build_object('runAt', v_run_at, 'itens', v_company_items))
          ) into v_req_id;

          v_requests := v_requests || jsonb_build_object(
            'request_id', v_req_id, 'company_id', v_company, 'recipient', v_email);
          v_sent := v_sent + 1;
        end loop;
      end loop;

      if exists (select 1 from jsonb_array_elements(v_email_items) x where x->>'company_id' is null) then
        raise warning 'check_ticketing_sync_health: itens sem company_id não enviados';
        insert into public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
        values ('ticketing_sync_health','check_ticketing_sync_health','missing_company','sistema',
                jsonb_build_object('run_at', v_run_at, 'itens', v_email_items));
      end if;

      for i in 0 .. jsonb_array_length(v_email_keys) - 1 loop
        v_k := v_email_keys -> i;
        insert into public.sync_notifications_sent (config_id, sync_type, last_notified_at)
        values ((v_k->>'config_id')::uuid, v_k->>'sync_type', now())
        on conflict (config_id, sync_type)
          do update set last_notified_at = excluded.last_notified_at;
      end loop;
    exception when others then
      raise warning 'check_ticketing_sync_health: envio de email falhou: % (%)', sqlerrm, sqlstate;
      insert into public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
      values ('ticketing_sync_health','check_ticketing_sync_health','email_failed','sistema',
              jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate,
                                 'itens', v_email_items, 'run_at', v_run_at));
      v_sent := -1;
    end;

    insert into public.bilheteira_sync_log (provider, parse_ok, raw_summary)
    values ('health', v_sent >= 0,
            jsonb_build_object('run_at', v_run_at, 'emails_sent', v_sent,
                               'requests', v_requests, 'itens', v_email_items));
  end if;

  return jsonb_build_object(
    'run_at', v_run_at,
    'items', v_items,
    'alerts', v_alerts,
    'emailed_items', v_email_items,
    'emails_sent', v_sent,
    'email_requests', v_requests,
    'reminder_active', jsonb_array_length(v_items) > 0);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_ticketing_sync_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_ticketing_sync_health() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health() TO service_role;