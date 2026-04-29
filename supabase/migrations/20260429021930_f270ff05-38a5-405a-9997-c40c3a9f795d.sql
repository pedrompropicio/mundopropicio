
-- 1) Tabela companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tax_id text,
  country text NOT NULL DEFAULT 'PT',
  currency text NOT NULL DEFAULT 'EUR',
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  logo_url text,
  favicon_url text,
  theme_config jsonb DEFAULT '{}'::jsonb,
  address jsonb DEFAULT '{}'::jsonb,
  contact_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2) Tabela company_invitations
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON public.company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON public.company_invitations(company_id);

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- 3) Adicionar company_id a profiles, user_roles, user_permissions (nullable em Fase 1)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company ON public.user_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_company ON public.user_permissions(company_id);

-- 4) Função current_company_id()
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 5) Função is_platform_admin()
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
$$;

-- 6) RLS para companies
DROP POLICY IF EXISTS "Users see their own company" ON public.companies;
CREATE POLICY "Users see their own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    id = public.current_company_id()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Platform admin manages companies" ON public.companies;
CREATE POLICY "Platform admin manages companies"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 7) RLS para company_invitations
DROP POLICY IF EXISTS "Read invitations" ON public.company_invitations;
CREATE POLICY "Read invitations"
  ON public.company_invitations FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS "Write invitations" ON public.company_invitations;
CREATE POLICY "Write invitations"
  ON public.company_invitations FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 8) Atualizar handle_new_user para ler company_id de raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := NULLIF(NEW.raw_user_meta_data->>'company_id', '')::uuid;

  INSERT INTO public.profiles (id, full_name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    v_company_id
  );

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (NEW.id, 'user', v_company_id);

  RETURN NEW;
END;
$function$;

-- 9) Bucket company-branding (público para logos/favicons)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-branding', 'company-branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read company branding" ON storage.objects;
CREATE POLICY "Public read company branding"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-branding');

DROP POLICY IF EXISTS "Platform admin manages company branding" ON storage.objects;
CREATE POLICY "Platform admin manages company branding"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'company-branding' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'company-branding' AND public.is_platform_admin());

-- 10) Seed: empresa Mundo Propício
INSERT INTO public.companies (legal_name, display_name, slug, country, currency, timezone, contact_email)
VALUES (
  'Mundo Propício, Lda',
  'Mundo Propício',
  'mundo-propicio',
  'PT',
  'EUR',
  'Europe/Lisbon',
  'adm@mundopropicio.com'
)
ON CONFLICT (slug) DO NOTHING;

-- 11) Atribuir todos os profiles existentes à empresa Mundo Propício
UPDATE public.profiles
   SET company_id = (SELECT id FROM public.companies WHERE slug = 'mundo-propicio')
 WHERE company_id IS NULL;

UPDATE public.user_roles
   SET company_id = (SELECT id FROM public.companies WHERE slug = 'mundo-propicio')
 WHERE company_id IS NULL;

UPDATE public.user_permissions
   SET company_id = (SELECT id FROM public.companies WHERE slug = 'mundo-propicio')
 WHERE company_id IS NULL;

-- 12) Promover pedroneto@mundopropicio.com a platform_admin
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT id, 'platform_admin'::app_role, NULL
  FROM public.profiles
 WHERE email = 'pedroneto@mundopropicio.com'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_roles
      WHERE user_id = profiles.id AND role = 'platform_admin'::app_role
   );
