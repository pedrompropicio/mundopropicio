-- D-ERP193 / Issue #282: destinatários e lembretes da vigia isolados por empresa.
-- O envio sai da base: a função calcula o plano por empresa; a edge function ticketing-sync-health envia.
ALTER TABLE public.system_reminders ADD COLUMN IF NOT EXISTS company_id uuid NULL;
COMMENT ON COLUMN public.system_reminders.company_id IS 'NULL = lembrete global da plataforma; preenchido = só visível a membros dessa empresa (Issue #282)';

DROP POLICY IF EXISTS system_reminders_company_isolation ON public.system_reminders;
CREATE POLICY system_reminders_company_isolation ON public.system_reminders
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id IS NULL OR public.row_belongs_to_current_company(company_id))
  WITH CHECK (company_id IS NULL OR public.row_belongs_to_current_company(company_id));

DROP FUNCTION IF EXISTS public.check_ticketing_sync_health();

CREATE FUNCTION public.check_ticketing_sync_health(_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_items jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_detail text;
  v_since text;
  v_has_tl_enabled boolean;
  v_capture_last timestamptz;
  v_recipients text[];
  v_last_notified timestamptz;
  v_run_at text := to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_cond text;
  v_company uuid;
  v_company_items jsonb;
  v_company_alerts jsonb;
  v_msg text;
  v_plan jsonb := '[]'::jsonb;
  v_status text;
  v_active_keys text[] := '{}';
begin
  for r in
    with cfg as (
      select 'ticketline'::text as src, 'Ticketline'::text as label, c.id, c.company_id, c.enabled, e.name as event_name
        from public.ticketline_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
      union all
      select 'bol', 'BOL', c.id, c.company_id, c.enabled, e.name
        from public.bol_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
      union all
      select 'coala', 'Coala', c.id, c.company_id, c.enabled, e.name
        from public.coala_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
      union all
      select 'fever', 'Fever', c.id, c.company_id, c.enabled, e.name
        from public.fever_sync_config c join public.events e on e.id = c.event_id where e.date >= current_date
      union all
      select 'onebox', 'Onebox', e.id, e.company_id, true, e.name
        from public.events e where e.id = 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid and e.date >= current_date
    ),
    runs as (
      select 'ticketline'::text as src, config_id, status, started_at, error_message from public.ticketline_sync_runs
      union all select 'bol', config_id, status, started_at, error_message from public.bol_sync_runs
      union all select 'coala', config_id, status, started_at, error_message from public.coala_sync_runs
      union all select 'fever', config_id, status, started_at, error_message from public.fever_sync_runs
      union all select 'onebox', 'bf9ce2d8-754e-4485-8427-e2d486c39919'::uuid, status, started_at, error_message from public.onebox_sync_runs
    ),
    ranked as (
      select src, config_id, status, started_at, error_message,
             row_number() over (partition by src, config_id order by started_at desc) as rn
        from runs
    )
    select cfg.src, cfg.label, cfg.id, cfg.company_id, cfg.enabled, cfg.event_name,
           (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3) as n3,
           (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 3
               and k.status not in ('success','warning','skipped')) as bad3,
           (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 6) as n6,
           (select count(*) from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn <= 6
               and k.status is distinct from 'success') as notok6,
           (select max(k.started_at) from ranked k where k.src = cfg.src and k.config_id = cfg.id
               and k.status in ('success','warning')) as last_ok,
           (select k.error_message from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_error,
           (select k.status from ranked k where k.src = cfg.src and k.config_id = cfg.id and k.rn = 1) as last_status
      from cfg order by cfg.src, cfg.event_name
  loop
    v_cond := null;
    if not r.enabled then v_cond := 'c';
    elsif r.n3 = 3 and r.bad3 = 3 then v_cond := 'a';
    elsif r.n6 = 6 and r.notok6 = 6 then v_cond := 'f';
    elsif r.last_ok is null or r.last_ok < now() - interval '6 hours' then v_cond := 'b';
    end if;
    if v_cond is null then continue; end if;

    v_detail := case when v_cond = 'c' then 'Import desligado (enabled = false)'
      else coalesce(nullif(r.last_status,'') || ': ' || coalesce(r.last_error,'sem mensagem'), 'sem corridas registadas') end;
    v_since := case when r.last_ok is null then 'nunca'
      else to_char(r.last_ok at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') end;

    v_items := v_items || jsonb_build_object('evento', r.event_name, 'bilheteira', r.label, 'condicao', v_cond,
      'detalhe', v_detail, 'desdeQuando', v_since, 'config_id', r.id, 'company_id', r.company_id);
  end loop;

  select exists (select 1 from public.ticketline_sync_config c join public.events e on e.id = c.event_id
                  where c.enabled and e.date >= current_date) into v_has_tl_enabled;
  if v_has_tl_enabled then
    select max(started_at) into v_capture_last from public.ticketline_sync_runs
     where triggered_by like 'capture_day:%' and status = 'success';
    if v_capture_last is null or v_capture_last < now() - interval '3 hours' then
      v_since := case when v_capture_last is null then 'nunca'
                      else to_char(v_capture_last at time zone 'Europe/Lisbon','DD/MM/YYYY HH24:MI') end;
      for r in select distinct c.company_id from public.ticketline_sync_config c join public.events e on e.id = c.event_id
                where c.enabled and e.date >= current_date and c.company_id is not null
      loop
        v_items := v_items || jsonb_build_object('evento', 'Todos os eventos Ticketline', 'bilheteira', 'Ticketline',
          'condicao', 'd', 'detalhe', 'Sem corrida capture_day com sucesso nas últimas 3 horas',
          'desdeQuando', v_since, 'company_id', r.company_id);
      end loop;
    end if;
  end if;

  for r in select s.* from public.ticketline_crosscheck_signals() s where s.cond_e or s.cond_g loop
    if r.cond_e then
      v_items := v_items || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'e',
        'detalhe', format('Variação diária do Mapa de Ocupação (xlsx) diferente da nossa em 3 dias seguidos: %s', r.series),
        'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'config_id', r.config_id, 'company_id', r.company_id);
    end if;
    if r.cond_g then
      v_items := v_items || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'g',
        'detalhe', format('PDF do portal mexeu %s bilhetes em 3 dias enquanto o xlsx do mesmo evento mexeu %s (nossas vendas: %s). Problema do fornecedor: %s',
          r.sum_pdf, r.sum_xlsx, r.sum_ours, r.series),
        'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'config_id', r.config_id, 'company_id', r.company_id);
    end if;
  end loop;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alerts
    from jsonb_array_elements(v_items) x where x->>'condicao' <> 'c';

  if exists (select 1 from jsonb_array_elements(v_items) x where x->>'company_id' is null) then
    raise warning 'check_ticketing_sync_health: itens sem company_id não enviados';
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
    select jsonb_agg(x) into v_company_items from jsonb_array_elements(v_items) x where (x->>'company_id')::uuid = v_company;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_company_alerts from jsonb_array_elements(v_alerts) x where (x->>'company_id')::uuid = v_company;
    v_active_keys := v_active_keys || ('ticketing_sync_stalled:' || v_company::text);

    select 'Sincronização de bilheteira a precisar de atenção:' || E'\n'
           || string_agg(format('%s · %s · condição (%s) · último sucesso %s · %s',
                x->>'evento', x->>'bilheteira', x->>'condicao', x->>'desdeQuando', x->>'detalhe'), E'\n')
           || E'\n\n(a) falha persistente · (b) parado >6h · (c) desligado · (d) captura horária parada · (e) variação xlsx ≠ nossas vendas · (f) 6 corridas seguidas sem sucesso · (g) PDF do portal parado com xlsx a mexer (fornecedor)'
      into v_msg from jsonb_array_elements(v_company_items) x;

    if not _dry_run then
      insert into public.system_reminders (key, title, message, due_date, frequency, link_url, is_active, company_id)
      values ('ticketing_sync_stalled:' || v_company::text, 'Sync de bilheteira precisa de atenção',
              v_msg, current_date, 'daily', '/bilheteiras', true, v_company)
      on conflict (key) do update set title = excluded.title, message = excluded.message, due_date = current_date,
        is_active = true, updated_at = now(), completed_at = null, company_id = excluded.company_id;
    end if;

    -- Destinatários SÓ desta empresa; platform_admin só entra se tiver papel NESTA empresa.
    select array_agg(distinct lower(p.email) order by lower(p.email)) into v_recipients
      from public.user_roles ur join public.profiles p on p.id = ur.user_id
     where ur.company_id = v_company
       and ur.role in ('admin','manager','platform_admin')
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
      'itens', v_company_alerts, 'status', v_status,
      'idempotency_day', to_char(v_today,'YYYYMMDD'));

    if v_status = 'sem_destinatarios' then
      raise warning 'check_ticketing_sync_health: empresa % sem admin/manager com email — bloco não enviado', v_company;
      if not _dry_run then
        insert into public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
        values ('ticketing_sync_health', v_company::text, 'no_recipients', 'sistema',
                jsonb_build_object('run_at', v_run_at, 'company_id', v_company, 'itens', v_company_alerts));
      end if;
    end if;
  end loop;

  if not _dry_run then
    update public.system_reminders set is_active = false, completed_at = now(), updated_at = now()
     where is_active and (key = 'ticketing_sync_stalled'
        or (key like 'ticketing_sync_stalled:%' and not (key = any(v_active_keys))));
  end if;

  return jsonb_build_object('run_at', v_run_at, 'dry_run', _dry_run, 'items', v_items,
    'plano_por_empresa', v_plan,
    'emails_que_sairiam', (select coalesce(sum(jsonb_array_length(p->'recipients')),0)
                             from jsonb_array_elements(v_plan) p where p->>'status' = 'enviar'),
    'reminder_active', jsonb_array_length(v_items) > 0);
end;
$function$;

REVOKE ALL ON FUNCTION public.check_ticketing_sync_health(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_ticketing_sync_health(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health(boolean) TO service_role;

-- Marca o envio diário da empresa (chamada pela edge function só depois de enviar).
CREATE OR REPLACE FUNCTION public.ticketing_health_mark_notified(_company uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  insert into public.sync_notifications_sent (config_id, sync_type, last_notified_at)
  values (_company, 'health_company_daily', now())
  on conflict (config_id, sync_type) do update set last_notified_at = excluded.last_notified_at;
$$;
REVOKE ALL ON FUNCTION public.ticketing_health_mark_notified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ticketing_health_mark_notified(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_health_mark_notified(uuid) TO service_role;