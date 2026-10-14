DO $migration$
DECLARE
 d text;
 en_html text := $html$<!DOCTYPE html>
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
</html>$html$;
 a integer; b integer;
BEGIN
 SELECT pg_get_functiondef('public.coala_send_eb_invite_batch(integer,boolean,text[])'::regprocedure) INTO d;
 IF md5(d) <> '9c1142558cb98be909d67a3a8334dc3e' THEN RAISE EXCEPTION 'Invite definition changed since review'; END IF;
 a := strpos(d, '      v_subject := ''Coala 2027: join');
 b := strpos(substr(d,a), E'\n    else') + a - 1;
 IF a=0 OR b<a THEN RAISE EXCEPTION 'EN anchor missing'; END IF;
 d := substr(d,1,a-1) || $en$      v_subject := 'Coala is back. And Early Bird is for the list only.';
      v_html := replace(replace($coala_en$$en$ || en_html || $en$$coala_en$, '{{CONFIRM_URL}}', v_url), '{{UNSUB_URL}}', v_unsub_url);
      v_text := 'Coala is back. Early Bird 27: one single tier, special price, only for those on the list. Sales open on November 3rd. Secure your spot: ' || v_url || E'\nUnsubscribe: ' || v_unsub_url;$en$ || substr(d,b);
 d := replace(d, split_part(d,E'\n',1), 'CREATE OR REPLACE FUNCTION public.coala_send_eb_invite_batch(p_daily_cap integer, p_dry_run boolean, p_only_emails text[], p_test_emails text[] DEFAULT NULL, p_test_locale text DEFAULT ''pt'')');
 d := replace(d, '  v_only text[];', E'  v_only text[];\n  v_test text[];');
 d := replace(d, E'begin\n  v_only', $validation$begin
  if p_dry_run is null then raise exception 'p_dry_run nao pode ser NULL'; end if;
  if p_test_locale is null or p_test_locale not in ('pt', 'en') then
    raise exception 'p_test_locale deve ser pt ou en';
  end if;
  if p_test_emails is not null and exists (select 1 from unnest(p_test_emails) e where e is null or btrim(e) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then
    raise exception 'p_test_emails contem endereco invalido';
  end if;
  v_test := (select array_agg(distinct lower(btrim(e))) from unnest(p_test_emails) e);
  v_only$validation$);
 d := replace(d, $anchor$  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc,$anchor$, $recipients$  -- Test mode selects only requested addresses; base counts stay unchanged.
  create temp table _eb_recipients on commit drop as
  select e, loc from _inv where p_test_emails is null and motivo is null
    and (v_only is null or e = any(v_only))
  union all
  select e, coalesce((select case when fb.language = 'Pt' then 'pt' else 'en' end
    from public.fever_buyers fb where fb.company_id = COALA
      and fb.edition_label = 'coala-2026' and lower(btrim(fb.email)) = requested.e
    order by fb.imported_at desc limit 1), p_test_locale)
  from unnest(v_test) requested(e)
  where not exists (select 1 from public.suppressed_emails s
    where s.company_id = COALA and lower(btrim(s.email)) = requested.e);

  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc,$recipients$);
 d := replace(d, $old$from (select e, loc from _inv where motivo is null
           and (v_only is null or e = any(v_only)) order by e limit 3) s;$old$, $new$from (select e, loc from _eb_recipients order by e
           limit case when p_test_emails is null then 3 else NULL end) s;$new$);
 d := replace(d, $old$'only_emails', v_only, 'ts', now()$old$, $new$'only_emails', v_only, 'test', p_test_emails is not null, 'test_emails', v_test, 'ts', now()$new$);
 d := replace(d, '  if p_daily_cap is null or p_daily_cap < 1 then', '  if p_test_emails is null and (p_daily_cap is null or p_daily_cap < 1) then');
 a := strpos(d, '  select count(*) into v_today');
 b := strpos(substr(d,a), E'  loop\n') + a - 1;
 d := substr(d,1,a-1) || $room$  if p_test_emails is not null then
    v_today := 0;
    select count(*) into v_room from _eb_recipients;
  else
    select count(*) into v_today from public.coala_invites
     where company_id = COALA and campaign = 'eb2027_invite'
       and (queued_at at time zone 'Europe/Lisbon')::date = (now() at time zone 'Europe/Lisbon')::date;
    v_room := greatest(p_daily_cap - v_today, 0);
  end if;

  for r in select e, loc from _eb_recipients order by e limit v_room
$room$ || substr(d,b);
 a := strpos(d, $anchor$    v_mid := 'coala-eb-inv:'$anchor$);
 b := strpos(substr(d,a), E'\n    v_unsub_token :=') + a - 1;
 d := substr(d,1,a-1) || $upsert$    if p_test_emails is not null then
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
$upsert$ || substr(d,b);
 d := replace(d, $old$jsonb_build_object('contagens', v_counts, 'only_emails', v_only, 'ja_hoje', v_today)$old$, $new$jsonb_build_object('contagens', v_counts, 'only_emails', v_only, 'ja_hoje', v_today, 'test', p_test_emails is not null, 'test_emails', v_test)$new$);
 d := replace(d, $old$'coala_send_eb_invite_batch', p_daily_cap, v_queued,$old$, $new$'coala_send_eb_invite_batch', case when p_test_emails is null then p_daily_cap else NULL end, v_queued,$new$);
 EXECUTE d;
END $migration$;
CREATE OR REPLACE FUNCTION public.coala_send_eb_invite_batch(p_daily_cap integer DEFAULT NULL, p_dry_run boolean DEFAULT true, p_only_emails text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $compat$ SELECT public.coala_send_eb_invite_batch(p_daily_cap, p_dry_run, p_only_emails, NULL::text[], 'pt'::text); $compat$;
REVOKE ALL ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text) TO service_role;
REVOKE ALL ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[]) TO service_role;