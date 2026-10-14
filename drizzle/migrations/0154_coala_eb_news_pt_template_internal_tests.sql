DO $migration$
DECLARE
  v_invite text;
  v_alert text;
  v_old_pt text := $old$      v_subject := 'Coala 2027: entra na lista do Early Bird';
      v_html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#FFFBF5;padding:32px;color:#141414"><img src="https://coalafestival.pt/email/logo.png" width="200" alt="Coala Festival Portugal" style="display:block;margin:0 auto 24px"/><p>Olá,</p><p>Estiveste no Coala Festival Portugal 2026. Os bilhetes Early Bird de 2027 vão abrir primeiro para uma lista especial.</p><p>Entra na lista para teres acesso ao lote especial:</p><p style="text-align:center"><a href="' || v_url || '" style="background:#141414;color:#FFFBF5;padding:14px 24px;text-decoration:none;border-radius:6px">Entrar na lista</a></p></div>';
      v_text := 'Olá, estiveste no Coala Festival Portugal 2026. Entra na lista do Early Bird 2027: ' || v_url || E'\nCancelar subscricao: ' || v_unsub_url;$old$;
  v_new_pt text := $new$      v_subject := 'O Coala volta. E o Early Bird é só para quem está na lista.';
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
      v_text := 'O Coala volta. Early Bird 27: um lote único, a preço especial, só para quem está na lista. Vendas abrem a 3 de novembro. Garante o teu lugar: ' || v_url || E'\nCancelar subscrição: ' || v_unsub_url;$new$;
  v_sample_anchor text := $anchor$  select coalesce(jsonb_agg(jsonb_build_object('email', e, 'locale', loc,$anchor$;
  v_internal text := $internal$  -- Internal test recipients are added after base counts; never mutate fever_buyers.
  insert into _inv (e, loc, motivo)
  select distinct e, 'pt'::text, null::text
    from unnest(v_only) as requested(e)
   where e ~ '^[^@[:space:]]+@mundopropicio[.]com$'
     and not exists (select 1 from _inv base where base.e = requested.e);

$internal$;
BEGIN
  SELECT pg_get_functiondef('public.coala_send_eb_invite_batch(integer,boolean,text[])'::regprocedure) INTO v_invite;
  SELECT pg_get_functiondef('public.coala_send_eb_open_alert(integer,boolean,text[])'::regprocedure) INTO v_alert;
  IF md5(v_invite) <> '8d7c36833862c51faf1c52ac1670456a' OR md5(v_alert) <> '05a8ed16bf51f29757129ef4bcfec461' THEN
    RAISE EXCEPTION 'Definitions changed since review; stop and review before applying';
  END IF;
  IF strpos(v_invite, v_old_pt) = 0 OR strpos(v_invite, v_sample_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected PT template or sample anchor not found; no changes applied';
  END IF;
  v_invite := replace(v_invite, 'noreply@notify.coalafestival.pt', 'noreply@news.coalafestival.pt');
  v_invite := replace(v_invite, 'SENDER_DOM constant text := ''notify.coalafestival.pt'';', 'SENDER_DOM constant text := ''news.coalafestival.pt'';');
  v_invite := replace(v_invite, v_old_pt, v_new_pt);
  v_invite := replace(v_invite, v_sample_anchor, v_internal || v_sample_anchor);
  v_alert := replace(v_alert, 'noreply@notify.coalafestival.pt', 'noreply@news.coalafestival.pt');
  v_alert := replace(v_alert, 'SENDER_DOM constant text := ''notify.coalafestival.pt'';', 'SENDER_DOM constant text := ''news.coalafestival.pt'';');
  EXECUTE v_invite;
  EXECUTE v_alert;
END
$migration$;
REVOKE ALL ON FUNCTION public.coala_send_eb_invite_batch(integer, boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_invite_batch(integer, boolean, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) TO service_role;