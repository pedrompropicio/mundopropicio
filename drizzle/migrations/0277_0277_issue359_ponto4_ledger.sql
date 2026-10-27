-- #359 ponto 4 — RASCUNHO R1, NÃO APLICAR. Pedro: 27/10/2026.
-- Passo A futuro, autorização própria. Nenhum seed/backfill.
CREATE TABLE public.coala_person_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL CHECK (company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid),
  email text NOT NULL CHECK (email=lower(btrim(email)) AND length(email)>0),
  channel text NOT NULL CHECK (channel IN ('ads','whatsapp')),
  decision text NOT NULL CHECK (decision IN ('granted','revoked')),
  text_version text,
  locale text NOT NULL CHECK (locale IN ('pt','en')),
  origin text NOT NULL DEFAULT 'email_manage_link' CHECK (origin='email_manage_link'),
  phone text,
  phone_fp text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,email,channel,idempotency_key),
  CHECK (channel='whatsapp' OR (phone IS NULL AND phone_fp IS NULL))
);
GRANT ALL ON public.coala_person_consents TO service_role;
REVOKE ALL ON public.coala_person_consents FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.coala_person_consents_id_seq TO service_role;
ALTER TABLE public.coala_person_consents ENABLE ROW LEVEL SECURITY;
-- Sem policies anon/authenticated. SECURITY DEFINER RPCs leem como owner.
CREATE INDEX coala_person_consents_latest ON public.coala_person_consents(company_id,email,channel,id DESC);

CREATE FUNCTION public._coala_person_consent_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE chosen text; server_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'coala_consent_append_only'; END IF;
  NEW.email:=lower(btrim(NEW.email));
  NEW.created_at:=server_now;
  IF NEW.decision='granted' THEN
    SELECT v.version INTO chosen FROM public.consent_text_versions v
    WHERE v.company_id=NEW.company_id AND v.channel=NEW.channel AND v.locale=NEW.locale
      AND v.valid_from<=server_now AND (v.valid_to IS NULL OR v.valid_to>server_now)
    ORDER BY v.valid_from DESC,v.created_at DESC,v.version DESC LIMIT 1;
    IF chosen IS NULL THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
    NEW.text_version:=chosen; -- nunca confiar numa versão enviada
    IF NEW.channel='whatsapp' AND (NEW.phone IS NULL OR NEW.phone !~ '^\+[1-9][0-9]{7,14}$')
    THEN RAISE EXCEPTION 'whatsapp_invalid_phone'; END IF;
  END IF;
  IF NEW.channel='ads' THEN NEW.phone:=NULL; NEW.phone_fp:=NULL;
  ELSE NEW.phone_fp:=CASE WHEN NEW.phone IS NOT NULL THEN encode(sha256(convert_to(NEW.phone,'UTF8')),'hex') END;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public._coala_person_consent_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coala_person_consent_insert BEFORE INSERT ON public.coala_person_consents
FOR EACH ROW EXECUTE FUNCTION public._coala_person_consent_guard();
CREATE TRIGGER coala_person_consent_immutable BEFORE UPDATE OR DELETE ON public.coala_person_consents
FOR EACH ROW EXECUTE FUNCTION public._coala_person_consent_guard();
CREATE TRIGGER coala_person_consent_no_truncate BEFORE TRUNCATE ON public.coala_person_consents
FOR EACH STATEMENT EXECUTE FUNCTION public._coala_person_consent_guard();