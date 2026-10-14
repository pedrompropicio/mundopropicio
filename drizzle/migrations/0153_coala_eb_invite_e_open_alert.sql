CREATE OR REPLACE FUNCTION public.coala_send_eb_open_alert(p_daily_cap integer DEFAULT NULL, p_dry_run boolean DEFAULT true, p_only_emails text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <noreply@notify.coalafestival.pt>';
  SENDER_DOM constant text := 'notify.coalafestival.pt';
  v_fever text;
  v_counts jsonb; v_sample jsonb;
  v_today int; v_room int; v_queued int := 0;
  r record; v_mid text;
  v_unsub_token text; v_unsub_url text; v_unsub_http text;
  v_subject text; v_html text; v_text text;
  v_only text[];
begin
  v_only := case when p_only_emails is null then null
                 else (select array_agg(lower(btrim(e))) from unnest(p_only_emails) e) end;

  select nullif(btrim(value #>> '{}'), '') into v_fever
    from public.portal_settings where company_id = COALA and key = 'early_bird.fever_url' limit 1;

  drop table if exists _alert;
  create temp table _alert on commit drop as
  select m.email e,
    coalesce(
      (select i.locale from public.coala_invites i where i.company_id = COALA and i.email = m.email and i.status = 'confirmed' limit 1),
      (select case when lower(lc.raw->>'locale') = 'en' then 'en' else 'pt' end from public.lead_capture lc
        where lc.company_id = COALA and lower(btrim(lc.email)) = m.email order by lc.created_at desc limit 1),
      'pt') loc,
    case
      when exists (select 1 from public.suppressed_emails s where s.company_id = COALA and s.email = m.email) then 'suprimido'
      when exists (select 1 from public.email_unsubscribe_tokens t where t.company_id = COALA and t.email = m.email and t.used_at is not null) then 'descadastrado'
      when exists (select 1 from public.email_send_log l where l.message_id = 'coala-eb-open:' || m.email) then 'ja_enviado'
      else null end motivo
  from public.coala_list_members m;

  select jsonb_build_object('na_lista', count(*),
    'excluidos', jsonb_build_object(
      'suprimido', count(*) filter (where motivo = 'suprimido'),
      'descadastrado', count(*) filter (where motivo = 'descadastrado'),
      'ja_enviado', count(*) filter (where motivo = 'ja_enviado')),
    'a_enviar', count(*) filter (where motivo is null),
    'por_idioma', jsonb_build_object(
      'pt', count(*) filter (where motivo is null and loc = 'pt'),
      'en', count(*) filter (where motivo is null and loc = 'en')))
  into v_counts from _alert;

  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc)), '[]'::jsonb) into v_sample
    from (select e, loc from _alert where motivo is null and (v_only is null or e = any(v_only)) order by e limit 3) s;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'fever_url', coalesce(v_fever, '(vazio)'),
      'contagens', v_counts, 'amostra', v_sample, 'only_emails', v_only, 'ts', now());
  end if;

  if v_fever is null then
    raise exception 'early_bird.fever_url esta vazio em portal_settings (empresa Coala).';
  end if;
  if p_daily_cap is null or p_daily_cap < 1 then
    raise exception 'p_daily_cap obrigatorio fora do dry run';
  end if;

  select coalesce(sum(queued), 0) into v_today from public.coala_send_runs
   where company_id = COALA and function_name = 'coala_send_eb_open_alert'
     and (created_at at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date;
  v_room := greatest(p_daily_cap - v_today, 0);

  for r in select e, loc from _alert where motivo is null
             and (v_only is null or e = any(v_only)) order by e limit v_room
  loop
    v_mid := 'coala-eb-open:' || r.e;
    v_unsub_token := public.coala_unsub_token(r.e);
    v_unsub_url := 'https://coalafestival.pt/unsubscribe?token=' || v_unsub_token || '&lang=' || r.loc;
    v_unsub_http := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;
    if r.loc = 'en' then
      v_subject := 'Early Bird 2027 is open — Coala Festival';
      v_html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#FFFBF5;padding:32px;color:#141414"><img src="https://coalafestival.pt/email/logo.png" width="200" alt="Coala Festival Portugal" style="display:block;margin:0 auto 24px"/><p>Hi,</p><p>You are on the list: Early Bird tickets for Coala Festival Portugal 2027 are now open.</p><p style="text-align:center"><a href="' || v_fever || '" style="background:#141414;color:#FFFBF5;padding:14px 24px;text-decoration:none;border-radius:6px">Buy ticket</a></p></div>';
      v_text := 'Early Bird 2027 is open: ' || v_fever || E'\nUnsubscribe: ' || v_unsub_url;
    else
      v_subject := 'O Early Bird 2027 abriu — Coala Festival';
      v_html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#FFFBF5;padding:32px;color:#141414"><img src="https://coalafestival.pt/email/logo.png" width="200" alt="Coala Festival Portugal" style="display:block;margin:0 auto 24px"/><p>Olá,</p><p>Estás na lista: os bilhetes Early Bird do Coala Festival Portugal 2027 já abriram.</p><p style="text-align:center"><a href="' || v_fever || '" style="background:#141414;color:#FFFBF5;padding:14px 24px;text-decoration:none;border-radius:6px">Comprar bilhete</a></p></div>';
      v_text := 'O Early Bird 2027 abriu: ' || v_fever || E'\nCancelar subscricao: ' || v_unsub_url;
    end if;
    perform public.enqueue_email('transactional_emails', jsonb_build_object(
      'company_id', COALA, 'message_id', v_mid, 'to', r.e, 'from', FROM_LINE,
      'sender_domain', SENDER_DOM, 'subject', v_subject, 'html', v_html, 'text', v_text,
      'purpose', 'marketing', 'label', 'coala_eb_open_alert', 'idempotency_key', v_mid,
      'unsubscribe_token', v_unsub_token, 'unsubscribe_url', v_unsub_url,
      'unsubscribe_http_url', v_unsub_http,
      'queued_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    v_queued := v_queued + 1;
  end loop;

  insert into public.coala_send_runs (company_id, function_name, daily_cap, queued, details)
  values (COALA, 'coala_send_eb_open_alert', p_daily_cap, v_queued,
          jsonb_build_object('contagens', v_counts, 'only_emails', v_only));

  return jsonb_build_object('dry_run', false, 'queued', v_queued, 'ja_hoje', v_today, 'contagens', v_counts);
end
$function$;
REVOKE ALL ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) TO service_role;