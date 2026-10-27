-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.tg_coala_lead_confirm()
-- stage: historical
-- provenance: {"effective_at": "2026-08-27T23:50:32Z", "live_catalog_sha256": "91689470a099d97976288de2c4075017718c2d37fa0d48fef61516aa22048918", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d528a5982727a1b1aee0c1ec5e775f86ae113fba9ad5b3f6e174e2612e34f569", "live_properties_sha256": "cf148f55f74c75b9b175745108fa34e0cf170e4414797220d92b236e8b7a4b83", "oid": 187656, "review": [6419810897, 6420287584], "rule": "sanitized_literal_reconstruction", "source_sql_sha256": "91c3f793f2946aaf052d51965aba122cb18aa00edb417aa94aa2e37f4f7116f7", "window": {"lower_oid": 186964, "lower_version": "20260827235031", "upper_oid": 187916, "upper_version": "20260828132648"}}
-- BEGIN OPERATION 0b5884009de110310cae426b046a47a257ce03596911c41de114dd8d9cd3eca6
CREATE OR REPLACE FUNCTION public.tg_coala_lead_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  FROM_LINE constant text := 'Coala Festival <mail-e91102acd216eca15d56e127b3064138fc3f67143259e86fce82e8cc98f5c450@homolog.invalid>';
  SENDER_DOM constant text := 'notify.coalafestival.pt';
  v_email_lc text;
  v_lang text;
  v_name text;
  v_greeting text;
  v_unsub_token text;
  v_unsub_url text;
  v_unsub_http text;
  v_price_html text := '';
  v_price_txt text := '';
  v_cta_url text := 'https://coalafestival.pt';
  v_subject text;
  v_html text;
  v_text text;
  v_message_id text;
begin
  -- Só leads da Coala, com email e opt-in.
  if NEW.company_id is distinct from COALA then return NEW; end if;
  if NEW.email is null or btrim(NEW.email) = '' or NEW.consent_email is not true then
    return NEW;
  end if;

  -- Best-effort: nada aqui pode abortar o INSERT do lead.
  begin
    v_email_lc := lower(btrim(NEW.email));

    -- Cancelou subscrição nesta empresa → não envia.
    if exists (
      select 1 from public.suppressed_emails s
       where s.email = v_email_lc and s.company_id = COALA
    ) then
      return NEW;
    end if;

    -- Já se tinha inscrito antes (ex.: preencheu o form do hero e o do Early
    -- Bird) → não repete a confirmação.
    if exists (
      select 1 from public.lead_capture lc
       where lc.company_id = COALA
         and lower(btrim(coalesce(lc.email, ''))) = v_email_lc
         and lc.consent_email is true
         and lc.id <> NEW.id
         and lc.created_at <= NEW.created_at
    ) then
      return NEW;
    end if;

    v_lang := case when lower(coalesce(NEW.raw->>'locale','')) = 'en' then 'en' else 'pt' end;

    -- O form do hero grava como nome a parte antes do @. Nesse caso, não é nome.
    v_name := nullif(btrim(coalesce(NEW.name, '')), '');
    if v_name is not null and lower(v_name) = lower(split_part(v_email_lc, '@', 1)) then
      v_name := null;
    end if;

    v_greeting := case
      when v_lang = 'en' then
        case when v_name is not null then 'Hi ' || v_name || ',' else 'Hi,' end
      else
        case when v_name is not null then 'Olá ' || v_name || ',' else 'Olá,' end
    end;

    v_unsub_token := public.coala_unsub_token(v_email_lc);
    v_unsub_url := 'https://coalafestival.pt/unsubscribe?token=' || v_unsub_token || '&lang=' || v_lang;
    -- endpoint que aceita o POST do one-click (RFC 8058); a pagina acima e so para humanos
    v_unsub_http := 'https://homolog-project.supabase.invalid/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;

    v_message_id := 'coala-signup:' || NEW.id::text;

    if v_lang = 'en' then
      v_subject := 'You''re on the list — Coala Festival 2027';
      v_html := '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFBF5;margin:0;padding:0">
<tr><td align="center" style="padding:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFBF5">
<tr><td style="background:#141414;padding:34px 32px 28px 32px;text-align:center">
<img src="https://coalafestival.pt/email/logo.png" width="240" alt="Coala Festival Portugal" style="display:block;width:240px;max-width:70%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
<div style="font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.28em;color:#8E8E8E;text-transform:uppercase;margin-top:16px">Est. 2014 &middot; Cascais</div>
</td></tr><tr><td style="padding:32px 32px 14px 32px">
<h1 style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:600;color:#141414">'
      || v_greeting
      || ' you''re on the list.</h1>
</td></tr><tr><td style="padding:0px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">Your sign-up is confirmed. You''ll be among the first to know when <strong>Early Bird</strong> tickets open for Coala Festival Portugal 2027.</p>
</td></tr><tr><td style="padding:0 32px">
<div style="border-top:1px solid #141414;border-bottom:1px solid #141414;padding:12px 0;text-align:center;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:11px;letter-spacing:.22em;color:#141414;text-transform:uppercase">29 + 30 May 2027 &nbsp;·&nbsp; Cascais</div>
</td></tr><tr><td style="padding:22px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">We''ll email you the moment they go on sale — nothing else to do until then.</p>
</td></tr><tr><td style="padding:0px 32px 0px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#8E8E8E">In the meantime, we''ll be revealing the line-up and behind-the-scenes on social.</p>
</td></tr><tr><td style="padding:28px 32px 4px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td style="background:#141414"><a href="https://coalafestival.pt" style="display:inline-block;padding:15px 34px;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.16em;color:#FFFBF5;text-decoration:none;text-transform:uppercase">Visit the site</a></td>
</tr></table></td></tr><tr><td style="padding:30px 32px 34px 32px">
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
      || ' you''re on the list.

Your sign-up is confirmed. You''ll be among the first to know when Early Bird tickets open for Coala Festival Portugal 2027.

29 + 30 May 2027 - Cascais

We''ll email you the moment they go on sale - nothing else to do until then.

Visit the site: https://coalafestival.pt

- -
You received this email because you signed up at coalafestival.pt.
Unsubscribe: '
      || v_unsub_url;
    else
      v_subject := 'Estás na lista — Coala Festival 2027';
      v_html := '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFBF5;margin:0;padding:0">
<tr><td align="center" style="padding:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFBF5">
<tr><td style="background:#141414;padding:34px 32px 28px 32px;text-align:center">
<img src="https://coalafestival.pt/email/logo.png" width="240" alt="Coala Festival Portugal" style="display:block;width:240px;max-width:70%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
<div style="font-family:Menlo,Consolas,''Courier New'',monospace;font-size:10px;letter-spacing:.28em;color:#8E8E8E;text-transform:uppercase;margin-top:16px">Est. 2014 &middot; Cascais</div>
</td></tr><tr><td style="padding:32px 32px 14px 32px">
<h1 style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:600;color:#141414">'
      || v_greeting
      || ' estás na lista.</h1>
</td></tr><tr><td style="padding:0px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">A tua inscrição está confirmada. Serás das primeiras pessoas a saber quando os bilhetes <strong>Early Bird</strong> abrirem para o Coala Festival Portugal 2027.</p>
</td></tr><tr><td style="padding:0 32px">
<div style="border-top:1px solid #141414;border-bottom:1px solid #141414;padding:12px 0;text-align:center;font-family:Menlo,Consolas,''Courier New'',monospace;font-size:11px;letter-spacing:.22em;color:#141414;text-transform:uppercase">29 + 30 Maio 2027 &nbsp;·&nbsp; Cascais</div>
</td></tr><tr><td style="padding:22px 32px 16px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#141414">Avisamos-te por email assim que estiverem à venda — não precisas de fazer mais nada até lá.</p>
</td></tr><tr><td style="padding:0px 32px 0px 32px">
<p style="margin:0;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#8E8E8E">Entretanto, vamos revelando o alinhamento e os bastidores nas redes.</p>
</td></tr><tr><td style="padding:28px 32px 4px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td style="background:#141414"><a href="https://coalafestival.pt" style="display:inline-block;padding:15px 34px;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.16em;color:#FFFBF5;text-decoration:none;text-transform:uppercase">Ver o site</a></td>
</tr></table></td></tr><tr><td style="padding:30px 32px 34px 32px">
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
      || ' estas na lista.

A tua inscricao esta confirmada. Seras das primeiras pessoas a saber quando os bilhetes Early Bird abrirem para o Coala Festival Portugal 2027.

29 + 30 Maio 2027 - Cascais

Avisamos-te por email assim que estiverem a venda - nao precisas de fazer mais nada ate la.

Ver o site: https://coalafestival.pt

- -
Recebeste este email porque te inscreveste em coalafestival.pt.
Cancelar subscricao: '
      || v_unsub_url;
    end if;

    perform public.enqueue_email('transactional_emails', jsonb_build_object(
      'company_id',        COALA,
      'message_id',        v_message_id,
      'to',                NEW.email,
      'from',              FROM_LINE,
      'sender_domain',     SENDER_DOM,
      'subject',           v_subject,
      'html',              v_html,
      'text',              v_text,
      'purpose',           'transactional',
      'label',             'coala_signup_confirm',
      'idempotency_key',   v_message_id,
      'unsubscribe_token', v_unsub_token,
      'unsubscribe_url',   v_unsub_url,
      'unsubscribe_http_url', v_unsub_http,
      'queued_at',         to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));

  exception when others then
    raise notice 'tg_coala_lead_confirm falhou para lead %: %', NEW.id, SQLERRM;
  end;

  return NEW;
end
$function$

;

ALTER FUNCTION "public"."tg_coala_lead_confirm"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."tg_coala_lead_confirm"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."tg_coala_lead_confirm"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."tg_coala_lead_confirm"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."tg_coala_lead_confirm"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."tg_coala_lead_confirm"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."tg_coala_lead_confirm"() TO "service_role";
-- END OPERATION 0b5884009de110310cae426b046a47a257ce03596911c41de114dd8d9cd3eca6
