-- Issue #309: public.fever_buyers — bases de compradores exportadas da Fever (só armazenamento).
-- Nunca tocar em lead_capture nem criar triggers de email nesta tabela.

CREATE TABLE public.fever_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  edition_label text NOT NULL,
  fever_event_id text,
  event_name text,
  first_name text,
  last_name text,
  email text NOT NULL,
  marketing_pref boolean NOT NULL DEFAULT false,
  event_date date,
  start_time text,
  ticket_type text,
  language text,
  order_ref text,
  line_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source_file text
);

-- Reimportar o mesmo CSV sem duplicar: line_hash vem calculado pelo importador.
CREATE UNIQUE INDEX fever_buyers_company_edition_line_hash_key
  ON public.fever_buyers (company_id, edition_label, line_hash);

CREATE INDEX fever_buyers_company_edition_idx
  ON public.fever_buyers (company_id, edition_label);

CREATE INDEX fever_buyers_lower_email_idx
  ON public.fever_buyers (lower(email));

-- Grants: leitura a authenticated; escrita só service_role; nada a anon.
GRANT SELECT ON public.fever_buyers TO authenticated;
GRANT ALL ON public.fever_buyers TO service_role;

ALTER TABLE public.fever_buyers ENABLE ROW LEVEL SECURITY;

-- SELECT para authenticated (isolamento vem da RESTRICTIVE abaixo)
CREATE POLICY fever_buyers_select_authenticated
  ON public.fever_buyers
  FOR SELECT
  TO authenticated
  USING (true);

-- Isolamento multi-tenant (mesmo molde das outras tabelas)
CREATE POLICY company_isolation_fever_buyers
  ON public.fever_buyers
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.row_belongs_to_current_company(company_id));
-- INSERT/UPDATE/DELETE: sem grant a authenticated e sem política permissiva → só service_role (bypassa RLS).