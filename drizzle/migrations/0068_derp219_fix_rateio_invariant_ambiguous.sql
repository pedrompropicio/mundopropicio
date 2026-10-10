CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH m AS (
    SELECT p.id AS m_id, p.description AS m_desc, p.amount AS m_amount, sum(ch.amount) AS m_soma, count(*) AS m_n
      FROM public.transactions p
      JOIN public.transactions ch ON ch.parent_transaction_id = p.id AND ch.split_percentage IS NOT NULL
     GROUP BY p.id, p.description, p.amount
    HAVING abs(p.amount - sum(ch.amount)) > 0.01
  )
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', m.m_id, 'descricao', m.m_desc, 'mae', m.m_amount, 'filhas', m.m_soma, 'n', m.m_n, 'diff', m.m_amount - m.m_soma) ORDER BY abs(m.m_amount - m.m_soma) DESC), '[]'::jsonb)
    INTO c, s FROM m;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'maes_rateio_divergentes';
END $function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;