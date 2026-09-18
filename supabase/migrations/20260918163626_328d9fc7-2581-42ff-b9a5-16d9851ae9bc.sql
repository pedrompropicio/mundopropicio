-- 1) Apagar o alerta morto -------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_sync_action_coala ON public.coala_sync_runs;
DROP TRIGGER IF EXISTS trg_notify_sync_action_fever ON public.fever_sync_runs;
DROP TRIGGER IF EXISTS trg_notify_sync_action_ticketline ON public.ticketline_sync_runs;
DROP FUNCTION IF EXISTS public.notify_sync_action_needed();

-- 2) URL do projeto correcto no escalador de SLA ---------------------------
CREATE OR REPLACE FUNCTION public.run_operacao_sla_escalator()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := 'https://sfohvvlqccmmebvjgibx.supabase.co';
  v_service_role text;
  r record;
  v_processed int := 0;
BEGIN
  SELECT decrypted_secret INTO v_service_role FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key' LIMIT 1;
  IF v_service_role IS NULL THEN
    RAISE WARNING 'run_operacao_sla_escalator: service_role secret missing';
    RETURN jsonb_build_object('error','service_role_missing');
  END IF;

  FOR r IN SELECT id, frente_id, company_id, priority, text, etapa_id
    FROM public.operacao_registros
    WHERE kind='chamado' AND status='open' AND acked_at IS NULL
      AND escalation_level=0 AND sla_half_at IS NOT NULL AND sla_half_at <= now()
  LOOP
    UPDATE public.operacao_registros SET escalation_level=1 WHERE id=r.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_role),
      body := jsonb_build_object(
        'target', jsonb_build_object('type','frente_team','frente_id', r.frente_id),
        'title','Chamado sem resposta',
        'body', COALESCE(NULLIF(r.text,''),'Chamado aberto') || ' (50% SLA)',
        'url','/operacao/chamado/' || r.id::text,
        'whatsapp', false,
        'tag','op-sla1-' || r.id::text
      )
    );
    v_processed := v_processed + 1;
  END LOOP;

  FOR r IN SELECT id, frente_id, company_id, priority, text
    FROM public.operacao_registros
    WHERE kind='chamado' AND status IN ('open','in_progress')
      AND escalation_level < 2 AND sla_due_at IS NOT NULL AND sla_due_at <= now()
  LOOP
    UPDATE public.operacao_registros SET escalation_level=2 WHERE id=r.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_role),
      body := jsonb_build_object(
        'target', jsonb_build_object('type','company_admins','company_id', r.company_id),
        'title','🚨 SLA vencido — chamado',
        'body', COALESCE(NULLIF(r.text,''),'Chamado vencido') || ' (' || COALESCE(r.priority,'') || ')',
        'url','/operacao/chamado/' || r.id::text,
        'whatsapp', COALESCE(r.priority IN ('crit','high'), false),
        'tag','op-sla2-' || r.id::text
      )
    );
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'ts', now());
END $function$;

REVOKE EXECUTE ON FUNCTION public.run_operacao_sla_escalator() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_operacao_sla_escalator() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_operacao_sla_escalator() TO service_role;

-- 3) Vigia de bilheteira cobre também Coala e Fever ------------------------
CREATE OR REPLACE FUNCTION public.check_ticketing_sync_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_items jsonb := '[]'::jsonb;        -- todos os casos (a,b,c,d)
  v_alerts jsonb := '[]'::jsonb;       -- só a,b,d (candidatos a email)
  v_alert_keys jsonb := '[]'::jsonb;   -- {config_id, sync_type} por alerta
  v_email_items jsonb := '[]'::jsonb;  -- alertas que passam o anti-spam
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
begin
  ------------------------------------------------------------------
  -- 1. Avaliar configs de eventos futuros
  ------------------------------------------------------------------
  for r in
    with cfg as (
      select 'ticketline'::text as src, 'Ticketline'::text as label,
             c.id, c.company_id, c.enabled, e.name as event_name
        from public.ticketline_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'bol'::text, 'BOL'::text,
             c.id, c.company_id, c.enabled, e.name
        from public.bol_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'coala'::text, 'Coala'::text,
             c.id, c.company_id, c.enabled, e.name
        from public.coala_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
      union all
      select 'fever'::text, 'Fever'::text,
             c.id, c.company_id, c.enabled, e.name
        from public.fever_sync_config c
        join public.events e on e.id = c.event_id
       where e.date >= current_date
    ),
    runs as (
      select 'ticketline'::text as src, config_id, status, started_at, error_message
        from public.ticketline_sync_runs
      union all
      select 'bol'::text, config_id, status, started_at, error_message
        from public.bol_sync_runs
      union all
      select 'coala'::text, config_id, status, started_at, error_message
        from public.coala_sync_runs
      union all
      select 'fever'::text, config_id, status, started_at, error_message
        from public.fever_sync_runs
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
        'detalhe', v_detail, 'desdeQuando', v_since);
      v_alert_keys := v_alert_keys || jsonb_build_object(
        'config_id', r.id, 'sync_type', r.src || '_health');
    end if;
  end loop;

  ------------------------------------------------------------------
  -- 2. Condição (d): captura horária da Ticketline parada
  ------------------------------------------------------------------
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
      v_items := v_items || jsonb_build_object(
        'evento', 'Todos os eventos Ticketline', 'bilheteira', 'Ticketline',
        'condicao', 'd', 'detalhe', 'Sem corrida capture_day com sucesso nas últimas 3 horas',
        'desdeQuando', v_since);
      v_alerts := v_alerts || jsonb_build_object(
        'evento', 'Todos os eventos Ticketline', 'bilheteira', 'Ticketline',
        'condicao', 'd', 'detalhe', 'Sem corrida capture_day com sucesso nas últimas 3 horas',
        'desdeQuando', v_since);
      v_alert_keys := v_alert_keys || jsonb_build_object(
        'config_id', v_capture_config_id, 'sync_type', 'ticketline_capture');
      v_lines := v_lines || format('Captura horária Ticketline · condição (d) · último sucesso %s', v_since) || E'\n';
    end if;
  end if;

  ------------------------------------------------------------------
  -- 3. system_reminders PRIMEIRO (o registo nunca depende do email)
  ------------------------------------------------------------------
  if jsonb_array_length(v_items) > 0 then
    v_msg := 'Sincronização de bilheteira a precisar de atenção:' || E'\n' || v_lines
      || E'\n' || '(a) falha persistente · (b) parado >6h · (c) desligado · (d) captura horária parada';

    insert into public.system_reminders (key, title, message, due_date, frequency, link_url, is_active)
    values ('ticketing_sync_stalled', 'Sync de bilheteira precisa de atenção',
            v_msg, current_date, 'daily', '/bilheteiras', true)
    on conflict (key) do update
      set title = excluded.title,
          message = excluded.message,
          due_date = current_date,
          is_active = true,
          updated_at = now(),
          completed_at = null;
  else
    update public.system_reminders
       set is_active = false, completed_at = now(), updated_at = now()
     where key = 'ticketing_sync_stalled' and is_active;
  end if;

  ------------------------------------------------------------------
  -- 4. Anti-spam: 12h por config
  ------------------------------------------------------------------
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

  ------------------------------------------------------------------
  -- 5. Email (falha aqui NÃO apaga o aviso escrito acima)
  ------------------------------------------------------------------
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

      foreach v_email in array v_recipients loop
        perform net.http_post(
          url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/send-transactional-email',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || v_service_role),
          body := jsonb_build_object(
            'templateName','ticketing-sync-alert',
            'recipientEmail', v_email,
            'idempotencyKey', 'ticketing-sync-health-' || v_email || '-'
              || to_char(now() at time zone 'UTC','YYYYMMDDHH24'),
            'templateData', jsonb_build_object('runAt', v_run_at, 'itens', v_email_items))
        );
        v_sent := v_sent + 1;
      end loop;

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
  end if;

  return jsonb_build_object(
    'run_at', v_run_at,
    'items', v_items,
    'alerts', v_alerts,
    'emailed_items', v_email_items,
    'emails_sent', v_sent,
    'reminder_active', jsonb_array_length(v_items) > 0);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_ticketing_sync_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_ticketing_sync_health() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health() TO service_role;

-- 4) Invariantes de email -------------------------------------------------
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES
  ('emails_falhados_24h',
   'Envios em email_send_log com status failed ou dlq nas últimas 24 horas',
   'error', 'global', 0,
   'Um email que falha tem de fazer barulho no mesmo dia. Referência 0 — qualquer falha é para investigar.'),
  ('emails_presos_pending',
   'Envios em email_send_log com status pending criados há mais de 24 horas',
   'warn', 'global',
   (SELECT count(*) FROM public.email_send_log WHERE status = 'pending' AND created_at < now() - interval '24 hours'),
   'Referência semeada a 18/09/2026 com a dívida conhecida de agosto (bilheteira-sync-digest e vip-coupon). O que faz barulho é o número mexer.')
ON CONFLICT (name) DO UPDATE
  SET description = excluded.description,
      severity = excluded.severity,
      scope = excluded.scope,
      notes = excluded.notes,
      updated_at = now();

CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
  cX bigint; sX jsonb;
  cF bigint; sF jsonb;
  cP bigint; sP jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.backup_runs b
          WHERE b.company_id = c.id
            AND b.status = 'ok'
            AND b.finished_at > now() - interval '30 hours'
       )
  ),
  global_falta AS (
    SELECT NULL::uuid AS company_id, 'global'::text AS slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.scope = 'global' AND b.status = 'ok') AS ultimo_ok
     WHERE NOT EXISTS (
       SELECT 1 FROM public.backup_runs b
        WHERE b.scope = 'global'
          AND b.status = 'ok'
          AND b.finished_at > now() - interval '30 hours'
     )
  ),
  bad AS (
    SELECT * FROM em_falta
    UNION ALL
    SELECT * FROM global_falta
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cB, sB FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cB, i.reference_count, (cB = i.reference_count) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';

  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela', e.schema_name || '.' || e.table_name, 'motivo', e.reason))
                     FROM public.backup_excluded_tables e), '[]'::jsonb)
    INTO cX, sX FROM public.backup_excluded_tables;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cX, i.reference_count, (cX = i.reference_count) AS conforme,
         i.notes, sX
    FROM public.system_invariants i
   WHERE i.name = 'backup_tabelas_excluidas';

  -- emails falhados nas últimas 24h
  WITH falhados AS (
    SELECT l.template_name, l.recipient_email, l.status, l.error_message, l.created_at
      FROM public.email_send_log l
     WHERE l.status IN ('failed','dlq')
       AND l.created_at > now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, recipient_email, status, error_message, created_at
                       FROM falhados ORDER BY created_at DESC LIMIT 6) x), '[]'::jsonb)
    INTO cF, sF FROM falhados;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cF, i.reference_count, (cF = i.reference_count) AS conforme,
         i.notes, sF
    FROM public.system_invariants i
   WHERE i.name = 'emails_falhados_24h';

  -- emails presos em pending há mais de 24h
  WITH presos AS (
    SELECT l.template_name, l.recipient_email, l.created_at
      FROM public.email_send_log l
     WHERE l.status = 'pending'
       AND l.created_at < now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, count(*) AS total,
                            min(created_at) AS mais_antigo, max(created_at) AS mais_recente
                       FROM presos GROUP BY template_name ORDER BY count(*) DESC LIMIT 6) x), '[]'::jsonb)
    INTO cP, sP FROM presos;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, i.reference_count, (cP = i.reference_count) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'emails_presos_pending';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;