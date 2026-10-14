-- D-ERP276: reenvio de convites/alertas perdidos (DLQ sem 'sent') com :r<n>,
-- mesmo token/confirm_url; ordem aleatória estável md5(email); índice lead_capture.
CREATE INDEX IF NOT EXISTS lead_capture_company_email_norm_idx
  ON public.lead_capture (company_id, lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.coala_send_eb_invite_batch(p_daily_cap integer, p_dry_run boolean, p_only_emails text[], p_test_emails text[], p_test_locale text DEFAULT 'pt'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <noreply@news.coalafestival.pt>';
  SENDER_DOM constant text := 'news.coalafestival.pt';
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
  v_test text[];
begin
  if p_dry_run is null then raise exception 'p_dry_run nao pode ser NULL'; end if;
  if p_test_locale is null or p_test_locale not in ('pt', 'en') then
    raise exception 'p_test_locale deve ser pt ou en';
  end if;
  if p_test_emails is not null and exists (select 1 from unnest(p_test_emails) e where e is null or btrim(e) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then
    raise exception 'p_test_emails contem endereco invalido';
  end if;
  v_test := (select array_agg(distinct lower(btrim(e))) from unnest(p_test_emails) e);
  v_only := case when p_only_emails is null then null
                 else (select array_agg(lower(btrim(e))) from unnest(p_only_emails) e) end;

  -- D-ERP276: estado de entrega por email (base + reenvios :r<n>), uma leitura do log.
  drop table if exists _invlog;
  create temp table _invlog on commit drop as
  select x.e, bool_or(x.status = 'sent') has_sent,
         (array_agg(x.status order by x.created_at desc))[1] last_status,
         count(distinct x.message_id) filter (where x.message_id ~ ':r[0-9]+$') n_reenvios
    from (select regexp_replace(substr(l.message_id, 14), ':r[0-9]+$', '') e, l.message_id, l.status, l.created_at
            from public.email_send_log l where l.message_id like 'coala-eb-inv:%') x
   group by x.e;

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
      else null end motivo,
    exists (select 1 from public.coala_invites i
              join _invlog g on g.e = i.email
             where i.company_id = COALA and i.campaign = 'eb2027_invite' and i.email = fb.e
               and i.status <> 'confirmed' and g.last_status = 'dlq' and not g.has_sent) reenvio
    from fb;

  select jsonb_build_object(
    'emails_unicos', count(*),
    'excluidos', jsonb_build_object(
      'suprimido', count(*) filter (where motivo = 'suprimido'),
      'descadastrado', count(*) filter (where motivo = 'descadastrado'),
      'ja_na_lista', count(*) filter (where motivo = 'ja_na_lista'),
      'ja_convidado', count(*) filter (where motivo = 'ja_convidado')),
    'a_convidar', count(*) filter (where motivo is null),
    'reenvio_pendente', count(*) filter (where motivo = 'ja_convidado' and reenvio),
    'por_idioma', jsonb_build_object(
      'pt', count(*) filter (where motivo is null and loc = 'pt'),
      'en', count(*) filter (where motivo is null and loc = 'en')))
  into v_counts from _inv;

  -- Internal test recipients are added after base counts; never mutate fever_buyers.
  insert into _inv (e, loc, motivo, reenvio)
  select distinct e, 'pt'::text, null::text, false
    from unnest(v_only) as requested(e)
   where e ~ '^[^@[:space:]]+@mundopropicio[.]com$'
     and not exists (select 1 from _inv base where base.e = requested.e);

  -- Test mode selects only requested addresses; base counts stay unchanged.
  create temp table _eb_recipients on commit drop as
  select e, loc, false reenvio from _inv where p_test_emails is null and motivo is null
    and (v_only is null or e = any(v_only))
  union all
  -- Reenvio de convites perdidos (DLQ, sem 'sent'): mesmo token/confirm_url do convite.
  select inv.e, i.locale, true from _inv inv
    join public.coala_invites i on i.company_id = COALA and i.campaign = 'eb2027_invite' and i.email = inv.e
   where p_test_emails is null and inv.motivo = 'ja_convidado' and inv.reenvio
     and (v_only is null or inv.e = any(v_only))
  union all
  select e, coalesce((select case when fb.language = 'Pt' then 'pt' else 'en' end
    from public.fever_buyers fb where fb.company_id = COALA
      and fb.edition_label = 'coala-2026' and lower(btrim(fb.email)) = requested.e
    order by fb.imported_at desc limit 1), p_test_locale), false
  from unnest(v_test) requested(e)
  where not exists (select 1 from public.suppressed_emails s
    where s.company_id = COALA and lower(btrim(s.email)) = requested.e);

  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc,
           'confirm_url', 'https://coalafestival.pt/' || loc || '/confirmar?t=<token gerado no envio>')), '[]'::jsonb)
    into v_sample
    from (select e, loc from _eb_recipients order by md5(e), e
           limit case when p_test_emails is null then 3 else NULL end) s;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'contagens', v_counts, 'amostra', v_sample,
      'only_emails', v_only, 'test', p_test_emails is not null, 'test_emails', v_test,
      'ordem', 'md5(email)',
      'primeiros', (select jsonb_build_object(
          '250', jsonb_build_object('pt', count(*) filter (where rn <= 250 and loc = 'pt'), 'en', count(*) filter (where rn <= 250 and loc = 'en')),
          '1000', jsonb_build_object('pt', count(*) filter (where rn <= 1000 and loc = 'pt'), 'en', count(*) filter (where rn <= 1000 and loc = 'en')))
        from (select loc, row_number() over (order by md5(e), e) rn from _eb_recipients) o),
      'ts', now());
  end if;

  if p_test_emails is null and (p_daily_cap is null or p_daily_cap < 1) then
    raise exception 'p_daily_cap obrigatorio fora do dry run';
  end if;

  if p_test_emails is not null then
    v_today := 0;
    select count(*) into v_room from _eb_recipients;
  else
    select count(*) into v_today from public.coala_invites
     where company_id = COALA and campaign = 'eb2027_invite'
       and (queued_at at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date;
    v_room := greatest(p_daily_cap - v_today, 0);
  end if;

  for r in select e, loc, reenvio from _eb_recipients order by md5(e), e limit v_room
  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_url := 'https://coalafestival.pt/' || r.loc || '/confirmar?t=' || v_token;
    if r.reenvio then
      v_mid := 'coala-eb-inv:' || r.e || ':r' || (coalesce((select g.n_reenvios from _invlog g where g.e = r.e), 0) + 1);
      update public.coala_invites
         set message_id = v_mid, queued_at = now()
       where company_id = COALA and campaign = 'eb2027_invite' and email = r.e and status <> 'confirmed'
      returning token, confirm_url into v_token, v_url;
      if not found then continue; end if;
    elsif p_test_emails is not null then
      v_mid := 'coala-eb-test:' || r.e || ':' || extract(epoch from clock_timestamp())::bigint;
      insert into public.coala_invites (company_id, campaign, email, token, confirm_url, locale, message_id)
      values (COALA, 'eb2027_invite_test', r.e, v_token, v_url, r.loc, v_mid)
      on conflict (company_id, campaign, email) do update
        set token = excluded.token, confirm_url = excluded.confirm_url, locale = excluded.locale,
            status = 'queued', queued_at = now(), confirmed_at = NULL, message_id = excluded.message_id;
    else
      v_mid := 'coala-eb-inv:' || r.e;
      insert into public.coala_invites (company_id, email, token, confirm_url, locale, message_id)
      values (COALA, r.e, v_token, v_url, r.loc, v_mid)
      on conflict (company_id, campaign, email) do nothing;
      if not found then continue; end if;
    end if;

    v_unsub_token := public.coala_unsub_token(r.e);
    v_unsub_url := 'https://coalafestival.pt/unsubscribe?token=' || v_unsub_token || '&lang=' || r.loc;
    v_unsub_http := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;

    if r.loc = 'en' then
      v_subject := 'Coala is back. And Early Bird is for the list only.';
      v_html := replace(replace($coala_en$<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Coala Festival Portugal | Early Bird 27</title>
<style>
body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
body { margin:0 !important; padding:0 !important; width:100% !important; background:#1E1E1E; }
@media only screen and (max-width:620px) {
.container { width:100% !important; }
.fluid { width:100% !important; height:auto !important; }
.btn-cell { width:auto !important; padding-right:20px !important; }
.hide-m { display:none !important; width:0 !important; }
.btn { font-size:14px !important; line-height:56px !important; letter-spacing:2px !important; }
.btn-cell td { height:56px !important; }
}
</style>
</head>
<body style="margin:0; padding:0; background:#1E1E1E;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#1E1E1E;">Early Bird 27: one single tier, special price, only for those on the list. Sales open on November 3rd.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1E1E1E;">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#FFFAF6;">
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/01-topo.png" width="600" height="194" alt="Coala Festival Portugal. Hipódromo Manuel Possolo, Cascais." style="width:600px; height:auto;"></td></tr>
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/en/02-texto.png" width="600" height="379" alt="EARLY BIRD 27. Only for those on the list: one single tier, special price, until sold out. Sales open on November 3rd. If you are not on the list, you are out." style="width:600px; height:auto;"></td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="20" style="width:20px; font-size:0; line-height:0;">&nbsp;</td>
<td class="btn-cell" width="405" valign="top" style="width:405px; padding-bottom:17px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" height="45" bgcolor="#141414" style="height:45px; background:#141414;">
<a class="btn" href="{{CONFIRM_URL}}" target="_blank" style="display:block; line-height:45px; color:#FFFBF5; font-family:'Courier New', Courier, monospace; font-size:16px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; text-align:center; text-decoration:none; white-space:nowrap; padding:0 24px;">JOIN THE LIST</a>
</td></tr></table>
</td>
<td class="hide-m" valign="top" style="font-size:0; line-height:0;"><img src="https://coalafestival.pt/email/eb27/03-botao-direita.png" width="175" height="88" alt="" style="width:175px; height:auto;"></td>
</tr></table>
</td></tr>
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/04-rodape.png" width="600" height="133" alt="Coala Music, Cascais, est. 2014." style="width:600px; height:auto;"></td></tr>
</table>
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
<tr><td align="center" style="padding:16px 20px 8px; font-family:Helvetica, Arial, sans-serif; font-size:11px; line-height:16px; color:#8E8E8E;">You're receiving this email because you bought tickets for Coala Festival Portugal 2026.<br>Coala Festival Portugal · <a href="{{UNSUB_URL}}" style="color:#8E8E8E; text-decoration:underline;">Unsubscribe</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>$coala_en$, '{{CONFIRM_URL}}', v_url), '{{UNSUB_URL}}', v_unsub_url);
      v_text := 'Coala is back. Early Bird 27: one single tier, special price, only for those on the list. Sales open on November 3rd. Secure your spot: ' || v_url || E'\nUnsubscribe: ' || v_unsub_url;
    else
      v_subject := 'O Coala volta. E o Early Bird é só para quem está na lista.';
      v_html := replace(replace($coala_pt$<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Coala Festival Portugal | Early Bird 27</title>
<style>
body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
body { margin:0 !important; padding:0 !important; width:100% !important; background:#1E1E1E; }
@media only screen and (max-width:620px) {
.container { width:100% !important; }
.fluid { width:100% !important; height:auto !important; }
.btn-cell { width:auto !important; padding-right:20px !important; }
.hide-m { display:none !important; width:0 !important; }
.btn { font-size:14px !important; line-height:56px !important; letter-spacing:2px !important; }
.btn-cell td { height:56px !important; }
}
</style>
</head>
<body style="margin:0; padding:0; background:#1E1E1E;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#1E1E1E;">Early Bird 27: um lote único, a preço especial, só para quem está na lista. Vendas abrem a 3 de novembro.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1E1E1E;">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#FFFAF6;">
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/01-topo.png" width="600" height="194" alt="Coala Festival Portugal. Hipódromo Manuel Possolo, Cascais." style="width:600px; height:auto;"></td></tr>
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/02-texto.png" width="600" height="379" alt="EARLY BIRD 27. Só para quem está na lista: um lote único, a preço especial, até esgotar. A 3 de novembro, abrem as vendas. Quem não estiver na lista, fica de fora." style="width:600px; height:auto;"></td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="20" style="width:20px; font-size:0; line-height:0;">&nbsp;</td>
<td class="btn-cell" width="405" valign="top" style="width:405px; padding-bottom:17px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" height="45" bgcolor="#141414" style="height:45px; background:#141414;">
<a class="btn" href="{{CONFIRM_URL}}" target="_blank" style="display:block; line-height:45px; color:#FFFBF5; font-family:'Courier New', Courier, monospace; font-size:16px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; text-align:center; text-decoration:none; white-space:nowrap; padding:0 24px;">GARANTIR O MEU LUGAR</a>
</td></tr></table>
</td>
<td class="hide-m" valign="top" style="font-size:0; line-height:0;"><img src="https://coalafestival.pt/email/eb27/03-botao-direita.png" width="175" height="88" alt="" style="width:175px; height:auto;"></td>
</tr></table>
</td></tr>
<tr><td><img class="fluid" src="https://coalafestival.pt/email/eb27/04-rodape.png" width="600" height="133" alt="Coala Music, Cascais, est. 2014." style="width:600px; height:auto;"></td></tr>
</table>
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
<tr><td align="center" style="padding:16px 20px 8px; font-family:Helvetica, Arial, sans-serif; font-size:11px; line-height:16px; color:#8E8E8E;">Recebes este email porque compraste bilhetes para o Coala Festival Portugal 2026.<br>Coala Festival Portugal · <a href="{{UNSUB_URL}}" style="color:#8E8E8E; text-decoration:underline;">Cancelar subscrição</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>$coala_pt$, '{{CONFIRM_URL}}', v_url), '{{UNSUB_URL}}', v_unsub_url);
      v_text := 'O Coala volta. Early Bird 27: um lote único, a preço especial, só para quem está na lista. Vendas abrem a 3 de novembro. Garante o teu lugar: ' || v_url || E'\nCancelar subscrição: ' || v_unsub_url;
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
  values (COALA, 'coala_send_eb_invite_batch', case when p_test_emails is null then p_daily_cap else NULL end, v_queued,
          jsonb_build_object('contagens', v_counts, 'only_emails', v_only, 'ja_hoje', v_today, 'test', p_test_emails is not null, 'test_emails', v_test));

  return jsonb_build_object('dry_run', false, 'queued', v_queued, 'ja_hoje', v_today, 'contagens', v_counts);
end
$function$;

CREATE OR REPLACE FUNCTION public.coala_send_eb_open_alert(p_daily_cap integer DEFAULT NULL::integer, p_dry_run boolean DEFAULT true, p_only_emails text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <noreply@news.coalafestival.pt>';
  SENDER_DOM constant text := 'news.coalafestival.pt';
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

  drop table if exists _alertlog;
  create temp table _alertlog on commit drop as
  select x.e, bool_or(x.status = 'sent') has_sent,
         (array_agg(x.status order by x.created_at desc))[1] last_status,
         count(distinct x.message_id) filter (where x.message_id ~ ':r[0-9]+$') n_reenvios
    from (select regexp_replace(substr(l.message_id, 15), ':r[0-9]+$', '') e, l.message_id, l.status, l.created_at
            from public.email_send_log l where l.message_id like 'coala-eb-open:%') x
   group by x.e;

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
      when exists (select 1 from _alertlog g where g.e = m.email) then 'ja_enviado'
      else null end motivo,
    coalesce((select g.last_status = 'dlq' and not g.has_sent from _alertlog g where g.e = m.email), false) reenvio,
    coalesce((select g.n_reenvios from _alertlog g where g.e = m.email), 0) n_reenvios
  from public.coala_list_members m;

  select jsonb_build_object('na_lista', count(*),
    'excluidos', jsonb_build_object(
      'suprimido', count(*) filter (where motivo = 'suprimido'),
      'descadastrado', count(*) filter (where motivo = 'descadastrado'),
      'ja_enviado', count(*) filter (where motivo = 'ja_enviado')),
    'a_enviar', count(*) filter (where motivo is null),
    'reenvio_pendente', count(*) filter (where motivo = 'ja_enviado' and reenvio),
    'por_idioma', jsonb_build_object(
      'pt', count(*) filter (where motivo is null and loc = 'pt'),
      'en', count(*) filter (where motivo is null and loc = 'en')))
  into v_counts from _alert;

  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc)), '[]'::jsonb) into v_sample
    from (select e, loc from _alert where (motivo is null or (motivo = 'ja_enviado' and reenvio)) and (v_only is null or e = any(v_only)) order by md5(e), e limit 3) s;

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

  for r in select e, loc, reenvio, n_reenvios from _alert
            where (motivo is null or (motivo = 'ja_enviado' and reenvio))
              and (v_only is null or e = any(v_only)) order by md5(e), e limit v_room
  loop
    v_mid := 'coala-eb-open:' || r.e || case when r.reenvio then ':r' || (r.n_reenvios + 1) else '' end;
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
