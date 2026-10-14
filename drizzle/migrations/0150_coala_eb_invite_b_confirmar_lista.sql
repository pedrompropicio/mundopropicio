CREATE OR REPLACE FUNCTION public.confirmar_lista(p_token text, p_marketing_opt_in boolean, p_locale text DEFAULT NULL)
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
    return jsonb_build_object('status','already','locale',v_locale);
  end if;

  -- Fonte coala_early_bird_invite: sem email de confirmação (trigger com WHEN)
  -- e sem conversões (process_lead_captures_batch salta esta fonte).
  insert into public.lead_capture (company_id, email, consent_email, source, raw)
  values (COALA, v_inv.email, coalesce(p_marketing_opt_in, false), 'coala_early_bird_invite',
          jsonb_build_object('locale', v_locale, 'invite_id', v_inv.id, 'text_version', TEXT_VERSION, 'list_member', true));

  insert into public.coala_list_consents (company_id, email, list_joined, marketing_opt_in, text_version, method, locale, invite_id)
  values (COALA, v_inv.email, true, coalesce(p_marketing_opt_in, false), TEXT_VERSION, 'token_email', v_locale, v_inv.id);

  update public.coala_invites set status = 'confirmed', confirmed_at = now() where id = v_inv.id;

  return jsonb_build_object('status','confirmed','locale',v_locale);
end
$function$;
REVOKE ALL ON FUNCTION public.confirmar_lista(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_lista(text, boolean, text) TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_coala_lead_confirm ON public.lead_capture;
CREATE TRIGGER trg_coala_lead_confirm AFTER INSERT ON public.lead_capture
  FOR EACH ROW WHEN (NEW.source IS DISTINCT FROM 'coala_early_bird_invite')
  EXECUTE FUNCTION public.tg_coala_lead_confirm();