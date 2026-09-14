-- FIX C — performance de RLS: auth.uid() -> (SELECT auth.uid())
--
-- auth.uid() é VOLATILE: dentro de uma policy é reavaliada POR LINHA, o que
-- provoca seq_scans massivos (ex.: user_roles). Embrulhada em subquery
-- ((SELECT auth.uid())) o planner avalia-a UMA vez por query (InitPlan).
--
-- Só apresentação do predicado: a semântica das policies é EXACTAMENTE a mesma.
-- Não recria políticas — usa ALTER POLICY. Idempotente: só toca em cláusulas
-- que contenham 'auth.uid()' ainda não embrulhado.

DO $do$
DECLARE
  r            record;
  new_qual     text;
  new_check    text;
  stmt         text;
  n_altered    int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname,
           c.relname AS tablename,
           pol.polname AS policyname,
           pg_get_expr(pol.polqual,      pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
    FROM pg_policy pol
    JOIN pg_class   c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        pg_get_expr(pol.polqual,        pol.polrelid) LIKE '%auth.uid()%'
        OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%auth.uid()%'
      )
    ORDER BY c.relname, pol.polname
  LOOP
    new_qual := CASE
      WHEN r.qual IS NULL THEN NULL
      WHEN r.qual LIKE '%( SELECT auth.uid()%' OR r.qual LIKE '%(SELECT auth.uid()%' THEN NULL
      ELSE replace(r.qual, 'auth.uid()', '(SELECT auth.uid())')
    END;

    new_check := CASE
      WHEN r.with_check IS NULL THEN NULL
      WHEN r.with_check LIKE '%( SELECT auth.uid()%' OR r.with_check LIKE '%(SELECT auth.uid()%' THEN NULL
      ELSE replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())')
    END;

    IF new_qual IS NULL AND new_check IS NULL THEN
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;

    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    n_altered := n_altered + 1;
  END LOOP;

  RAISE NOTICE 'FIX C: % politicas alteradas (auth.uid() -> (SELECT auth.uid()))', n_altered;
END
$do$;