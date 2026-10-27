-- #359 ponto 4 — RASCUNHO R1, NÃO APLICAR. Depende de A.
-- Não cria/consome tokens, não altera consent_whatsapp, não envia nada.
CREATE FUNCTION public.coala_autorizacoes_estado(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tok public.email_unsubscribe_tokens; a public.coala_person_consents; w public.coala_person_consents; has_phone boolean;
BEGIN
  IF p_token IS NULL OR length(p_token)<>64 OR p_token !~ '^[0-9a-f]{64}$'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO tok FROM public.email_unsubscribe_tokens
  WHERE token=p_token AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO a FROM public.coala_person_consents WHERE company_id=tok.company_id
    AND email=lower(btrim(tok.email)) AND channel='ads' ORDER BY id DESC LIMIT 1;
  SELECT * INTO w FROM public.coala_person_consents WHERE company_id=tok.company_id
    AND email=lower(btrim(tok.email)) AND channel='whatsapp' ORDER BY id DESC LIMIT 1;
  SELECT EXISTS(SELECT 1 FROM public.contacts c WHERE c.company_id=tok.company_id
    AND lower(btrim(c.email))=lower(btrim(tok.email)) AND c.phone_e164 ~ '^\+[1-9][0-9]{7,14}$') INTO has_phone;
  RETURN jsonb_build_object('status','ok','locale',coalesce(CASE WHEN a.id>w.id OR w.id IS NULL THEN a.locale ELSE w.locale END,'pt'),
    'ads',coalesce(a.decision='granted',false),'whatsapp',coalesce(w.decision='granted',false),'tem_telemovel',has_phone);
END
$function$;
REVOKE ALL ON FUNCTION public.coala_autorizacoes_estado(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.coala_autorizacoes_estado(text) TO anon,authenticated;

CREATE FUNCTION public.coala_autorizacoes_gravar(p_token text,p_ads boolean,p_whatsapp boolean,p_phone text,p_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tok public.email_unsubscribe_tokens; c public.contacts; a public.coala_person_consents; w public.coala_person_consents;
  e text; ph text; outcome text := 'ok'; blocked boolean; result jsonb; has_contact boolean;
BEGIN
  IF p_token IS NULL OR length(p_token)<>64 OR p_token !~ '^[0-9a-f]{64}$'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO tok FROM public.email_unsubscribe_tokens
    WHERE token=p_token AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_ads IS NULL OR p_whatsapp IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('pt','en') THEN RAISE EXCEPTION 'consent_locale'; END IF;
  e:=lower(btrim(tok.email));
  -- Serializa decisões de tokens distintos do mesmo email/empresa; token lock coordena descadastro.
  PERFORM pg_advisory_xact_lock(hashtextextended(tok.company_id::text||':'||e,359));
  SELECT * INTO c FROM public.contacts WHERE company_id=tok.company_id AND lower(btrim(email))=e FOR UPDATE;
  has_contact:=FOUND;
  SELECT * INTO a FROM public.coala_person_consents WHERE company_id=tok.company_id AND email=e AND channel='ads' ORDER BY id DESC LIMIT 1;
  SELECT * INTO w FROM public.coala_person_consents WHERE company_id=tok.company_id AND email=e AND channel='whatsapp' ORDER BY id DESC LIMIT 1;
  blocked:=tok.used_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.suppressed_emails s
    WHERE (s.company_id IS NULL OR s.company_id=tok.company_id)
      AND (lower(btrim(s.email))=e OR s.email='sha256:'||encode(sha256(convert_to(e,'UTF8')),'hex')));
  IF blocked AND (p_ads OR p_whatsapp) THEN RAISE EXCEPTION 'consent_grant_forbidden'; END IF;
  ph:=coalesce(nullif(btrim(p_phone),''),nullif(btrim(c.phone_e164),''));
  IF p_whatsapp THEN
    IF ph IS NULL OR ph !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'whatsapp_invalid_phone'; END IF;
    IF NOT has_contact THEN outcome:='contact_missing';
    ELSIF nullif(btrim(c.phone_e164),'') IS NULL THEN
      -- Único efeito sobre contacts: preencher vazio. Índice único resolve também corridas entre emails.
      BEGIN
        UPDATE public.contacts SET phone_e164=ph WHERE id=c.id AND company_id=tok.company_id AND nullif(btrim(phone_e164),'') IS NULL;
        c.phone_e164:=ph;
      EXCEPTION WHEN unique_violation THEN outcome:='phone_conflict';
      END;
    ELSIF c.phone_e164<>ph THEN outcome:='phone_conflict';
    END IF;
  END IF;
  IF p_ads IS DISTINCT FROM coalesce(a.decision='granted',false) THEN
    INSERT INTO public.coala_person_consents(company_id,email,channel,decision,locale,text_version)
    VALUES(tok.company_id,e,'ads',CASE WHEN p_ads THEN 'granted' ELSE 'revoked' END,p_locale,CASE WHEN NOT p_ads THEN a.text_version END);
  END IF;
  IF p_whatsapp IS DISTINCT FROM coalesce(w.decision='granted',false)
    OR (p_whatsapp AND w.phone IS DISTINCT FROM ph) THEN
    INSERT INTO public.coala_person_consents(company_id,email,channel,decision,locale,phone,text_version)
    VALUES(tok.company_id,e,'whatsapp',CASE WHEN p_whatsapp THEN 'granted' ELSE 'revoked' END,p_locale,
      CASE WHEN p_whatsapp THEN ph ELSE w.phone END,CASE WHEN NOT p_whatsapp THEN w.text_version END);
  END IF;
  result:=public.coala_autorizacoes_estado(p_token);
  RETURN result||jsonb_build_object('status',outcome);
END
$function$;
REVOKE ALL ON FUNCTION public.coala_autorizacoes_gravar(text,boolean,boolean,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.coala_autorizacoes_gravar(text,boolean,boolean,text,text) TO anon,authenticated;