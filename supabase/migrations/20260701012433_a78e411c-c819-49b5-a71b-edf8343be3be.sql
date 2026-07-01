
-- Tabela para armazenar listas de emails/telefones carregadas para audiências Meta (Customer Match).
-- Isolada de public.contacts (não misturar compradores de terceiros com o CRM próprio).

CREATE TABLE public.meta_audience_upload_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  audience_local_id uuid NOT NULL REFERENCES public.meta_custom_audiences(id) ON DELETE CASCADE,
  email text NULL,
  phone_e164 text NULL,
  email_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN email IS NOT NULL AND btrim(email) <> ''
      THEN encode(extensions.digest(lower(btrim(email)), 'sha256'::text), 'hex'::text)
      ELSE NULL
    END
  ) STORED,
  phone_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN phone_e164 IS NOT NULL AND btrim(phone_e164) <> ''
      THEN encode(extensions.digest(phone_e164, 'sha256'::text), 'hex'::text)
      ELSE NULL
    END
  ) STORED,
  source_label text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_audience_upload_members_has_identifier CHECK (
    email IS NOT NULL OR phone_e164 IS NOT NULL
  )
);

CREATE INDEX idx_meta_audience_upload_members_audience
  ON public.meta_audience_upload_members(audience_local_id);

CREATE UNIQUE INDEX uniq_meta_audience_upload_members_email
  ON public.meta_audience_upload_members(audience_local_id, email_hash_sha256)
  WHERE email_hash_sha256 IS NOT NULL;

CREATE UNIQUE INDEX uniq_meta_audience_upload_members_phone
  ON public.meta_audience_upload_members(audience_local_id, phone_hash_sha256)
  WHERE phone_hash_sha256 IS NOT NULL;

-- GRANTs (dados pessoais: só authenticated com role; service_role full para edge fns)
GRANT SELECT, INSERT, DELETE ON public.meta_audience_upload_members TO authenticated;
GRANT ALL ON public.meta_audience_upload_members TO service_role;

ALTER TABLE public.meta_audience_upload_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_audience_upload_members_select
  ON public.meta_audience_upload_members
  FOR SELECT TO authenticated
  USING (
    row_belongs_to_current_company(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

CREATE POLICY meta_audience_upload_members_insert
  ON public.meta_audience_upload_members
  FOR INSERT TO authenticated
  WITH CHECK (
    row_belongs_to_current_company(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

CREATE POLICY meta_audience_upload_members_delete
  ON public.meta_audience_upload_members
  FOR DELETE TO authenticated
  USING (
    row_belongs_to_current_company(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

-- RPC que devolve os hashes prontos para a edge crm-meta-audience-sync consumir.
-- Dual-mode auth: aceita service_role (edge/cron) OU authenticated com role da company.
CREATE OR REPLACE FUNCTION public.crm_meta_audience_collect_upload_members(
  p_audience_local_id uuid
)
RETURNS TABLE (
  email_hash_sha256 text,
  phone_hash_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  v_company_id uuid;
BEGIN
  SELECT mca.company_id INTO v_company_id
  FROM public.meta_custom_audiences mca
  WHERE mca.id = p_audience_local_id;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authenticated';
    END IF;
    IF NOT row_belongs_to_current_company(v_company_id) THEN
      RAISE EXCEPTION 'company mismatch';
    END IF;
    IF NOT (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'marketing_manager'::app_role)
    ) THEN
      RAISE EXCEPTION 'insufficient role';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT m.email_hash_sha256, m.phone_hash_sha256
  FROM public.meta_audience_upload_members m
  WHERE m.audience_local_id = p_audience_local_id
    AND (m.email_hash_sha256 IS NOT NULL OR m.phone_hash_sha256 IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_meta_audience_collect_upload_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_meta_audience_collect_upload_members(uuid) TO authenticated, service_role;
