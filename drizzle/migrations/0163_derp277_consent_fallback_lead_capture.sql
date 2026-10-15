-- D-ERP277 rev.: consentimento do contacto novo cai para o lead_capture mais recente.
CREATE OR REPLACE FUNCTION public.confirmar_lista(p_token text, p_marketing_opt_in boolean, p_locale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  TEXT_VERSION constant text := 'eb2027-v1';
  v_inv public.coala_invites%rowtype;
  v_locale text;
  v_last boolean;
  v_in_list boolean;
  v_status text;
  v_lc_at timestamptz;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status','invalid');
  end if;

  select * into v_inv from public.coala_invites
   where token = p_token and company_id = COALA
   for update;
  if not found then
    return jsonb_build_object('status','invalid');
  end if;

  v_locale := case when lower(coalesce(p_locale, v_inv.locale)) = 'en' then 'en' else 'pt' end;
  v_in_list := v_inv.status = 'confirmed'
    or exists (select 1 from public.coala_list_members m where m.email = v_inv.email);

  if v_in_list then
    select marketing_opt_in into v_last from public.coala_list_consents
     where company_id = COALA and email = v_inv.email
     order by created_at desc limit 1;
    if v_last is distinct from coalesce(p_marketing_opt_in, false) then
      insert into public.coala_list_consents (company_id, email, list_joined, marketing_opt_in, text_version, method, locale, invite_id)
      values (COALA, v_inv.email, true, coalesce(p_marketing_opt_in, false), TEXT_VERSION, 'token_email', v_locale, v_inv.id);
    end if;
    if v_inv.status <> 'confirmed' then
      update public.coala_invites set status = 'confirmed', confirmed_at = now() where id = v_inv.id;
    end if;
    v_status := 'already';
  else
    -- Fonte coala_early_bird_invite: sem email de confirmação (trigger com WHEN)
    -- e sem conversões (process_lead_captures_batch salta esta fonte).
    insert into public.lead_capture (company_id, email, consent_email, source, raw)
    values (COALA, v_inv.email, coalesce(p_marketing_opt_in, false), 'coala_early_bird_invite',
            jsonb_build_object('locale', v_locale, 'invite_id', v_inv.id, 'text_version', TEXT_VERSION, 'list_member', true));

    insert into public.coala_list_consents (company_id, email, list_joined, marketing_opt_in, text_version, method, locale, invite_id)
    values (COALA, v_inv.email, true, coalesce(p_marketing_opt_in, false), TEXT_VERSION, 'token_email', v_locale, v_inv.id);

    update public.coala_invites set status = 'confirmed', confirmed_at = now() where id = v_inv.id;
    v_status := 'confirmed';
  end if;

  -- Contacto: só cria se não existir. Consentimento (D-ERP277 rev.): último marketing_opt_in
  -- em coala_list_consents; senão consent_email do lead_capture mais recente; senão false.
  -- Entrar na lista nunca é consentimento.
  select marketing_opt_in into v_last from public.coala_list_consents
   where company_id = COALA and email = v_inv.email
   order by created_at desc limit 1;
  if v_last is null then
    select l.consent_email, l.created_at into v_last, v_lc_at from public.lead_capture l
     where l.company_id = COALA and lower(btrim(l.email)) = v_inv.email
     order by l.created_at desc limit 1;
  end if;
  insert into public.contacts (company_id, email, source, consent_email, consent_email_at)
  select COALA, v_inv.email, 'coala_early_bird_invite', coalesce(v_last, false),
         case when v_last then coalesce(v_lc_at, now()) end
   where not exists (select 1 from public.contacts c
                      where c.company_id = COALA and lower(btrim(c.email)) = v_inv.email)
  on conflict do nothing;

  return jsonb_build_object('status', v_status, 'locale', v_locale);
end
$function$;

-- Correção dos contactos do backfill de 15/10 sem coala_list_consents e com lead_capture consent_email=true.
UPDATE public.contacts c
   SET consent_email = true,
       consent_email_at = (SELECT lc.created_at FROM public.lead_capture lc
                            WHERE lc.company_id = c.company_id AND lower(btrim(lc.email)) = lower(btrim(c.email))
                            ORDER BY lc.created_at DESC LIMIT 1)
 WHERE c.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'
   AND c.source = 'coala_early_bird_invite'
   AND c.created_at::date = date '2026-10-15'
   AND c.consent_email = false
   AND (SELECT lc.consent_email FROM public.lead_capture lc
         WHERE lc.company_id = c.company_id AND lower(btrim(lc.email)) = lower(btrim(c.email))
         ORDER BY lc.created_at DESC LIMIT 1) = true
   AND NOT EXISTS (SELECT 1 FROM public.coala_list_consents k
                    WHERE k.company_id = c.company_id AND k.email = lower(btrim(c.email)));