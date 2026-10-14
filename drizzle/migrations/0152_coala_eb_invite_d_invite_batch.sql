CREATE OR REPLACE FUNCTION public.coala_send_eb_invite_batch(p_daily_cap integer DEFAULT NULL, p_dry_run boolean DEFAULT true, p_only_emails text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <noreply@notify.coalafestival.pt>';
  SENDER_DOM constant text := 'notify.coalafestival.pt';
  v_counts jsonb;
  v_sample jsonb;
  v_today int;
  v_room int;
  v_queued int := 0;
  r record;
  v_token text; v_url text; v_mid text;
  v_unsub_token text; v_unsub_url text; v_unsub_http text;
  v_subject text; v_html text; v_text text;
  v_only text[];
begin
  v_only := case when p_only_emails is null then null
                 else (select array_agg(lower(btrim(e))) from unnest(p_only_emails) e) end;

  create temp table _inv on commit drop as
  with fb as (
    select lower(btrim(email)) e,
           (array_agg(language order by imported_at desc))[1] lang
      from public.fever_buyers
     where company_id = COALA and edition_label = 'coala-2026'
       and email is not null and btrim(email) <> ''
     group by 1
  )
  select fb.e, case when fb.lang = 'Pt' then 'pt' else 'en' end loc,
    case
      when exists (select 1 from public.suppressed_emails s where s.company_id = COALA and s.email = fb.e) then 'suprimido'
      when exists (select 1 from public.email_unsubscribe_tokens t where t.company_id = COALA and t.email = fb.e and t.used_at is not null) then 'descadastrado'
      when exists (select 1 from public.coala_list_members m where m.email = fb.e) then 'ja_na_lista'
      when exists (select 1 from public.coala_invites i where i.company_id = COALA and i.campaign = 'eb2027_invite' and i.email = fb.e) then 'ja_convidado'
      else null end motivo
    from fb;

  select jsonb_build_object(
    'emails_unicos', count(*),
    'excluidos', jsonb_build_object(
      'suprimido', count(*) filter (where motivo = 'suprimido'),
      'descadastrado', count(*) filter (where motivo = 'descadastrado'),
      'ja_na_lista', count(*) filter (where motivo = 'ja_na_lista'),
      'ja_convidado', count(*) filter (where motivo = 'ja_convidado')),
    'a_convidar', count(*) filter (where motivo is null),
    'por_idioma', jsonb_build_object(
      'pt', count(*) filter (where motivo is null and loc = 'pt'),
      'en', count(*) filter (where motivo is null and loc = 'en')))
  into v_counts from _inv;

  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc,
           'confirm_url', 'https://coalafestival.pt/' || loc || '/confirmar?t=<token gerado no envio>')), '[]'::jsonb)
    into v_sample
    from (select e, loc from _inv where motivo is null
           and (v_only is null or e = any(v_only)) order by e limit 3) s;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'contagens', v_counts, 'amostra', v_sample,
      'only_emails', v_only, 'ts', now());
  end if;

  if p_daily_cap is null or p_daily_cap < 1 then
    raise exception 'p_daily_cap obrigatorio fora do dry run';
  end if;

  select count(*) into v_today from public.coala_invites
   where company_id = COALA and campaign = 'eb2027_invite'
     and (queued_at at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date;
  v_room := greatest(p_daily_cap - v_today, 0);

  for r in select e, loc from _inv where motivo is null
             and (v_only is null or e = any(v_only)) order by e limit v_room
  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_url := 'https://coalafestival.pt/' || r.loc || '/confirmar?t=' || v_token;
    v_mid := 'coala-eb-inv:' || r.e;

    insert into public.coala_invites (company_id, email, token, confirm_url, locale, message_id)
    values (COALA, r.e, v_token, v_url, r.loc, v_mid)
    on conflict (company_id, campaign, email) do nothing;
    if not found then continue; end if;

    v_unsub_token := public.coala_unsub_token(r.e);
    v_unsub_url := 'https://coalafestival.pt/unsubscribe?token=' || v_unsub_token || '&lang=' || r.loc;
    v_unsub_http := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;

    if r.loc = 'en' then
      v_subject := 'Coala 2027: join the Early Bird list';
      v_html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#FFFBF5;padding:32px;color:#141414"><img src="https://coalafestival.pt/email/logo.png" width="200" alt="Coala Festival Portugal" style="display:block;margin:0 auto 24px"/><p>Hi,</p><p>You were at Coala Festival Portugal 2026. Early Bird tickets for 2027 will be released to a special list first.</p><p>Join the list to get access to the special batch:</p><p style="text-align:center"><a href="' || v_url || '" style="background:#141414;color:#FFFBF5;padding:14px 24px;text-decoration:none;border-radius:6px">Join the list</a></p></div>';
      v_text := 'Hi, you were at Coala Festival Portugal 2026. Join the Early Bird 2027 list: ' || v_url || E'\nUnsubscribe: ' || v_unsub_url;
    else
      v_subject := 'Coala 2027: entra na lista do Early Bird';
      v_html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#FFFBF5;padding:32px;color:#141414"><img src="https://coalafestival.pt/email/logo.png" width="200" alt="Coala Festival Portugal" style="display:block;margin:0 auto 24px"/><p>Olá,</p><p>Estiveste no Coala Festival Portugal 2026. Os bilhetes Early Bird de 2027 vão abrir primeiro para uma lista especial.</p><p>Entra na lista para teres acesso ao lote especial:</p><p style="text-align:center"><a href="' || v_url || '" style="background:#141414;color:#FFFBF5;padding:14px 24px;text-decoration:none;border-radius:6px">Entrar na lista</a></p></div>';
      v_text := 'Olá, estiveste no Coala Festival Portugal 2026. Entra na lista do Early Bird 2027: ' || v_url || E'\nCancelar subscricao: ' || v_unsub_url;
    end if;

    perform public.enqueue_email('transactional_emails', jsonb_build_object(
      'company_id', COALA, 'message_id', v_mid, 'to', r.e, 'from', FROM_LINE,
      'sender_domain', SENDER_DOM, 'subject', v_subject, 'html', v_html, 'text', v_text,
      'purpose', 'marketing', 'label', 'coala_eb_invite', 'idempotency_key', v_mid,
      'unsubscribe_token', v_unsub_token, 'unsubscribe_url', v_unsub_url,
      'unsubscribe_http_url', v_unsub_http,
      'queued_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    v_queued := v_queued + 1;
  end loop;

  insert into public.coala_send_runs (company_id, function_name, daily_cap, queued, details)
  values (COALA, 'coala_send_eb_invite_batch', p_daily_cap, v_queued,
          jsonb_build_object('contagens', v_counts, 'only_emails', v_only, 'ja_hoje', v_today));

  return jsonb_build_object('dry_run', false, 'queued', v_queued, 'ja_hoje', v_today, 'contagens', v_counts);
end
$function$;
REVOKE ALL ON FUNCTION public.coala_send_eb_invite_batch(integer, boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_invite_batch(integer, boolean, text[]) TO service_role;