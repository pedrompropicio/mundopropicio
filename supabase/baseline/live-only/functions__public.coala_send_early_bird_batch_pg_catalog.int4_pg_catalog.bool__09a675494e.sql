-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.coala_send_early_bird_batch(pg_catalog.int4,pg_catalog.bool)
-- stage: historical
-- provenance: {"effective_at": "2026-08-27T23:50:33Z", "live_catalog_sha256": "231bc197c4302113baf6410f4755a1aae0a02eb538c9d67a3f6531361f150390", "live_definition_sha256": "7ba1a07a81c15b6c60a5c37cf8fb4304bf21c008f83cbd3d4ea29362efd320d6", "live_properties_sha256": "c6e295101085f8a25a2ff754c7acd0049a42790ea956fd22909e680a4a43b2f2", "oid": 187659, "review": [6419810897, 6420287584], "rule": "sanitized_literal_reconstruction", "source_sql_sha256": "13c459bb2868e4da1c18e0173c78209536c6df9a878f10f11393b3e8c9b89ea9", "window": {"lower_oid": 187656, "lower_version": "reconstructed_function_187656", "upper_oid": 187916, "upper_version": "20260828132648"}}
-- BEGIN OPERATION 141437f712e00446defccfb0fee5a89913627ade0f36a6533f5d6cb5fa9ffdb5
CREATE OR REPLACE FUNCTION public.coala_send_early_bird_batch(p_limit integer DEFAULT 500, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <mail-e91102acd216eca15d56e127b3064138fc3f67143259e86fce82e8cc98f5c450@homolog.invalid>';
  SENDER_DOM constant text := 'notify.coalafestival.pt';
  r record;
  v_price text;
  v_price_html text := '';
  v_price_txt text := '';
  v_cta_url text;
  v_lang text;
  v_name text;
  v_greeting text;
  v_unsub_token text;
  v_unsub_url text;
  v_unsub_http text;
  v_subject text;
  v_html text;
  v_text text;
  v_message_id text;
  v_queued int := 0;
  v_sample jsonb := '[]'::jsonb;
begin
  select nullif(btrim(value #>> '{}'), '') into v_price
    from public.portal_settings
   where company_id = COALA and key = 'early_bird.price_label' limit 1;

  select nullif(btrim(value #>> '{}'), '') into v_cta_url
    from public.portal_settings
   where company_id = COALA and key = 'early_bird.fever_url' limit 1;

  if v_cta_url is null then
    -- O email diz "Comprar bilhete". Sem URL de bilheteira apontaria para a
    -- homepage, o que num envio de venda e pior do que nao enviar.
    if not p_dry_run then
      raise exception 'early_bird.fever_url esta vazio em portal_settings (empresa Coala). Preencher antes de enviar: o botao de compra apontaria para a homepage.';
    end if;
    v_cta_url := 'https://coalafestival.pt';
  end if;

  if v_price is not null then
    v_price_html := ' &nbsp;·&nbsp; ' || v_price;
    v_price_txt := ' - ' || v_price;
  end if;

  for r in
    select distinct on (lower(btrim(lc.email)))
           lower(btrim(lc.email)) as email,
           lc.email as email_raw,
           lc.name as name,
           lc.raw->>'locale' as locale
      from public.lead_capture lc
     where lc.company_id = COALA
       and lc.consent_email is true
       and lc.email is not null
       and btrim(lc.email) <> ''
       -- cancelou subscrição
       and not exists (
         select 1 from public.suppressed_emails s
          where s.email = lower(btrim(lc.email)) and s.company_id = COALA
       )
       -- já lhe foi enviado neste lote (message_id é determinístico por email)
       and not exists (
         select 1 from public.email_send_log l
          where l.message_id = 'coala-eb:' || lower(btrim(lc.email))
       )
     order by lower(btrim(lc.email)), lc.created_at desc
     limit greatest(p_limit, 1)
  loop
    v_lang := case when lower(coalesce(r.locale, '')) = 'en' then 'en' else 'pt' end;

    v_name := nullif(btrim(coalesce(r.name, '')), '');
    if v_name is not null and lower(v_name) = lower(split_part(r.email, '@', 1)) then
      v_name := null;
    end if;

    v_greeting := case
      when v_lang = 'en' then
        case when v_name is not null then 'Hi ' || v_name || ',' else 'Hi,' end
      else
        case when v_name is not null then 'Olá ' || v_name || ',' else 'Olá,' end
    end;

    v_message_id := 'coala-eb:' || r.email;

    if v_queued < 5 then
      v_sample := v_sample || jsonb_build_object('email', r.email, 'lang', v_lang, 'greeting', v_greeting);
    end if;

    v_queued := v_queued + 1;

    if p_dry_run then
      continue;
    end if;

    v_unsub_token := public.coala_unsub_token(r.email);
    v_unsub_url := 'https://coalafestival.pt/unsubscribe?token=' || v_unsub_token || '&lang=' || v_lang;
    -- endpoint que aceita o POST do one-click (RFC 8058); a pagina acima e so para humanos
    v_unsub_http := 'https://homolog-project.supabase.invalid/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;

    if v_lang = 'en' then
      v_subject := 'Early Bird is open — Coala Festival 2027';
      v_html := '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFBF5;margin:0;padding:0">
<tr><td align="center" style="padding:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFBF5">
<tr><td style="background:#141414;padding:34px 32px 28px 32px;text-align:center">
<img src="https://coalafestival.pt/email/logo.png" width="240" alt="Coala Festival Portugal" style="display:block;width:240px;max-width:70%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
<div style="font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.28em;color:#8E8E8E;text-transform:uppercase;margin-top:16px">Early Bird &middot; Open</div>
</td></tr><tr><td style="padding:32px 32px 14px 32px">
<h1 style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:600;color:#141414">'
      || v_greeting
      || ' Early Bird is open.</h1>
</td></tr><tr><td style="padding:0px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">As promised, you''re hearing it first: Early Bird tickets for Coala Festival Portugal 2027 are now on sale.</p>
</td></tr><tr><td style="padding:0 32px">
<div style="border-top:1px solid #141414;border-bottom:1px solid #141414;padding:12px 0;text-align:center;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:11px;letter-spacing:.22em;color:#141414;text-transform:uppercase">29 + 30 May 2027 &nbsp;·&nbsp; Cascais'
      || v_price_html
      || '</div>
</td></tr><tr><td style="padding:28px 32px 4px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td style="background:#141414"><a href="'
      || v_cta_url
      || '" style="display:inline-block;padding:15px 34px;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.16em;color:#FFFBF5;text-decoration:none;text-transform:uppercase">Buy tickets</a></td>
</tr></table></td></tr><tr><td style="padding:24px 32px 0px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#8E8E8E">Early Bird is limited. Once it sells out, the price moves up to the next tier — there is no restock.</p>
</td></tr><tr><td style="padding:30px 32px 34px 32px">
<div style="border-top:1px solid #E3DDD1;padding-top:18px;text-align:center">
<p style="margin:0 0 12px 0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#8E8E8E">You received this email because you signed up at coalafestival.pt.<br/>
<a href="'
      || v_unsub_url
      || '" style="color:#8E8E8E;text-decoration:underline">Unsubscribe</a>
&nbsp;·&nbsp;
<a href="https://coalafestival.pt/en/privacy" style="color:#8E8E8E;text-decoration:underline">Privacy policy</a>
</p>
<p style="margin:0;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.2em;color:#8E8E8E;text-transform:uppercase">
<a href="https://www.instagram.com/coalafestival.pt/" style="color:#8E8E8E;text-decoration:none">Instagram</a>
&nbsp;·&nbsp;
<a href="https://www.facebook.com/61553941799334/" style="color:#8E8E8E;text-decoration:none">Facebook</a>
&nbsp;·&nbsp;
<a href="https://coalafestival.pt" style="color:#8E8E8E;text-decoration:none">coalafestival.pt</a>
</p></div></td></tr>
</table></td></tr></table>';
      v_text := v_greeting
      || ' Early Bird is open.

As promised, you''re hearing it first: Early Bird tickets for Coala Festival Portugal 2027 are now on sale.

29 + 30 May 2027 - Cascais'
      || v_price_txt
      || '

Buy tickets: '
      || v_cta_url
      || '

Early Bird is limited. Once it sells out, the price moves up to the next tier.

- -
You received this email because you signed up at coalafestival.pt.
Unsubscribe: '
      || v_unsub_url;
    else
      v_subject := 'Early Bird aberto — Coala Festival 2027';
      v_html := '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFBF5;margin:0;padding:0">
<tr><td align="center" style="padding:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFBF5">
<tr><td style="background:#141414;padding:34px 32px 28px 32px;text-align:center">
<img src="https://coalafestival.pt/email/logo.png" width="240" alt="Coala Festival Portugal" style="display:block;width:240px;max-width:70%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
<div style="font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.28em;color:#8E8E8E;text-transform:uppercase;margin-top:16px">Early Bird &middot; Aberto</div>
</td></tr><tr><td style="padding:32px 32px 14px 32px">
<h1 style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:600;color:#141414">'
      || v_greeting
      || ' o Early Bird está aberto.</h1>
</td></tr><tr><td style="padding:0px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">Como prometido, avisamos-te primeiro: os bilhetes Early Bird do Coala Festival Portugal 2027 já estão à venda.</p>
</td></tr><tr><td style="padding:0 32px">
<div style="border-top:1px solid #141414;border-bottom:1px solid #141414;padding:12px 0;text-align:center;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:11px;letter-spacing:.22em;color:#141414;text-transform:uppercase">29 + 30 Maio 2027 &nbsp;·&nbsp; Cascais'
      || v_price_html
      || '</div>
</td></tr><tr><td style="padding:28px 32px 4px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td style="background:#141414"><a href="'
      || v_cta_url
      || '" style="display:inline-block;padding:15px 34px;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.16em;color:#FFFBF5;text-decoration:none;text-transform:uppercase">Comprar bilhete</a></td>
</tr></table></td></tr><tr><td style="padding:24px 32px 0px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#8E8E8E">Early Bird é quantidade limitada. Quando esgotar, passa para o preço seguinte — não há reposição.</p>
</td></tr><tr><td style="padding:30px 32px 34px 32px">
<div style="border-top:1px solid #E3DDD1;padding-top:18px;text-align:center">
<p style="margin:0 0 12px 0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#8E8E8E">Recebeste este email porque te inscreveste em coalafestival.pt.<br/>
<a href="'
      || v_unsub_url
      || '" style="color:#8E8E8E;text-decoration:underline">Cancelar subscrição</a>
&nbsp;·&nbsp;
<a href="https://coalafestival.pt/pt/privacidade" style="color:#8E8E8E;text-decoration:underline">Política de privacidade</a>
</p>
<p style="margin:0;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.2em;color:#8E8E8E;text-transform:uppercase">
<a href="https://www.instagram.com/coalafestival.pt/" style="color:#8E8E8E;text-decoration:none">Instagram</a>
&nbsp;·&nbsp;
<a href="https://www.facebook.com/61553941799334/" style="color:#8E8E8E;text-decoration:none">Facebook</a>
&nbsp;·&nbsp;
<a href="https://coalafestival.pt" style="color:#8E8E8E;text-decoration:none">coalafestival.pt</a>
</p></div></td></tr>
</table></td></tr></table>';
      v_text := v_greeting
      || ' o Early Bird esta aberto.

Como prometido, avisamos-te primeiro: os bilhetes Early Bird do Coala Festival Portugal 2027 ja estao a venda.

29 + 30 Maio 2027 - Cascais'
      || v_price_txt
      || '

Comprar bilhete: '
      || v_cta_url
      || '

Early Bird e quantidade limitada. Quando esgotar, passa para o preco seguinte.

- -
Recebeste este email porque te inscreveste em coalafestival.pt.
Cancelar subscricao: '
      || v_unsub_url;
    end if;

    perform public.enqueue_email('transactional_emails', jsonb_build_object(
      'company_id',        COALA,
      'message_id',        v_message_id,
      'to',                r.email_raw,
      'from',              FROM_LINE,
      'sender_domain',     SENDER_DOM,
      'subject',           v_subject,
      'html',              v_html,
      'text',              v_text,
      'purpose',           'marketing',
      'label',             'coala_early_bird',
      'idempotency_key',   v_message_id,
      'unsubscribe_token', v_unsub_token,
      'unsubscribe_url',   v_unsub_url,
      'unsubscribe_http_url', v_unsub_http,
      'queued_at',         to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'destinatarios', v_queued,
    'price_label', coalesce(v_price, '(vazio)'),
    'cta_url', v_cta_url,
    'amostra', v_sample,
    'ts', now()
  );
end
$function$

;

ALTER FUNCTION "public"."coala_send_early_bird_batch"(p_limit integer, p_dry_run boolean) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."coala_send_early_bird_batch"(p_limit integer, p_dry_run boolean) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."coala_send_early_bird_batch"(integer, boolean)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."coala_send_early_bird_batch"(p_limit integer, p_dry_run boolean) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."coala_send_early_bird_batch"(p_limit integer, p_dry_run boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."coala_send_early_bird_batch"(p_limit integer, p_dry_run boolean) TO "service_role";
-- END OPERATION 141437f712e00446defccfb0fee5a89913627ade0f36a6533f5d6cb5fa9ffdb5
