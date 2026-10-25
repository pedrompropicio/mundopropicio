-- #359 RASCUNHO — NÃO APLICADO. Migração A: versões do texto de consentimento + 3 colunas opcionais em lead_capture.
-- Sem backfill, sem alterar linhas existentes. Seed é DML separado (passo próprio).
CREATE TABLE public.consent_text_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL CHECK (version ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}$'),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  text_sha256 text GENERATED ALWAYS AS (encode(sha256(convert_to(text,'UTF8')),'hex')) STORED,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_text_versions_uniq UNIQUE (version, company_id, locale, channel),
  CONSTRAINT consent_text_versions_window CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX consent_text_versions_lookup ON public.consent_text_versions (company_id, channel, locale, version);
GRANT SELECT ON public.consent_text_versions TO authenticated;
GRANT ALL ON public.consent_text_versions TO service_role;
ALTER TABLE public.consent_text_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_text_versions_read ON public.consent_text_versions
  FOR SELECT TO authenticated USING (public.row_belongs_to_current_company(company_id));
-- Imutável: nova redação = nova versão. Só valid_to pode ser fechado (uma vez).
CREATE FUNCTION public._consent_text_versions_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.text,NEW.version,NEW.locale,NEW.channel,NEW.company_id,NEW.valid_from,NEW.created_at,NEW.id)
     IS DISTINCT FROM (OLD.text,OLD.version,OLD.locale,OLD.channel,OLD.company_id,OLD.valid_from,OLD.created_at,OLD.id)
     OR (OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to)
  THEN RAISE EXCEPTION 'consent_text_version_immutable'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._consent_text_versions_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER consent_text_versions_immutable BEFORE UPDATE OR DELETE ON public.consent_text_versions
  FOR EACH ROW EXECUTE FUNCTION public._consent_text_versions_immutable();

ALTER TABLE public.lead_capture
  ADD COLUMN consent_email_text_version text,
  ADD COLUMN consent_whatsapp_text_version text,
  ADD COLUMN consent_decided_at timestamptz;
