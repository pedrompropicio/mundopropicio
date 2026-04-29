-- Fase 4 — Storage paths multi-empresa
-- Aplica camada RESTRICTIVE em storage.objects: o primeiro segmento do path
-- (storage.foldername(name))[1] tem de ser o company_id do utilizador atual.
-- platform_admin passa por cima de tudo.
-- Buckets isolados: 11. Buckets globais: company-branding (público) e database-backups (service-role).

-- Helper: valida se o path pertence à empresa atual ou se o user é platform_admin
CREATE OR REPLACE FUNCTION public.storage_path_belongs_to_current_company(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(auth.uid())
    OR (
      public.current_company_id() IS NOT NULL
      AND _name IS NOT NULL
      AND (storage.foldername(_name))[1] = public.current_company_id()::text
    );
$$;

GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO anon, authenticated;

-- RESTRICTIVE policy aplicada por bucket isolado, em todos os comandos.
-- Mantemos as policies PERMISSIVE existentes (CRUD por role) intactas.

DO $$
DECLARE
  b text;
  isolated_buckets text[] := ARRAY[
    'bp-version-snapshots',
    'cache-extra-documents',
    'camarim-documents',
    'closing-cost-documents',
    'implementation-files',
    'import-reports',
    'partner-extra-documents',
    'supplier-credit-documents',
    'supplier-documents',
    'ticket-office-settlements',
    'transaction-documents'
  ];
  cmd text;
  pol_name text;
BEGIN
  FOREACH b IN ARRAY isolated_buckets LOOP
    FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      pol_name := 'company_isolation_' || replace(b, '-', '_') || '_' || lower(cmd);

      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol_name);

      IF cmd = 'INSERT' THEN
        EXECUTE format($f$
          CREATE POLICY %I ON storage.objects
          AS RESTRICTIVE
          FOR INSERT
          TO authenticated
          WITH CHECK (
            bucket_id <> %L
            OR public.storage_path_belongs_to_current_company(name)
          )
        $f$, pol_name, b);
      ELSIF cmd = 'UPDATE' THEN
        EXECUTE format($f$
          CREATE POLICY %I ON storage.objects
          AS RESTRICTIVE
          FOR UPDATE
          TO authenticated
          USING (
            bucket_id <> %L
            OR public.storage_path_belongs_to_current_company(name)
          )
          WITH CHECK (
            bucket_id <> %L
            OR public.storage_path_belongs_to_current_company(name)
          )
        $f$, pol_name, b, b);
      ELSE
        EXECUTE format($f$
          CREATE POLICY %I ON storage.objects
          AS RESTRICTIVE
          FOR %s
          TO authenticated
          USING (
            bucket_id <> %L
            OR public.storage_path_belongs_to_current_company(name)
          )
        $f$, pol_name, cmd, b);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Migrar paths existentes em Test: prefixar com '{mundo_propicio_id}/' caso ainda não estejam.
-- ID Mundo Propício em Test: 975254b9-6b92-4cdd-a971-36e4a4f98525
DO $$
DECLARE
  mp_id text := '975254b9-6b92-4cdd-a971-36e4a4f98525';
  isolated_buckets text[] := ARRAY[
    'bp-version-snapshots',
    'cache-extra-documents',
    'camarim-documents',
    'closing-cost-documents',
    'implementation-files',
    'import-reports',
    'partner-extra-documents',
    'supplier-credit-documents',
    'supplier-documents',
    'ticket-office-settlements',
    'transaction-documents'
  ];
  b text;
  moved int;
BEGIN
  FOREACH b IN ARRAY isolated_buckets LOOP
    UPDATE storage.objects
       SET name = mp_id || '/' || name
     WHERE bucket_id = b
       AND (storage.foldername(name))[1] <> mp_id
       AND (storage.foldername(name))[1] NOT IN (
         SELECT id::text FROM public.companies
       );
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'Bucket %: % objetos migrados para prefixo %/', b, moved, mp_id;
  END LOOP;
END $$;