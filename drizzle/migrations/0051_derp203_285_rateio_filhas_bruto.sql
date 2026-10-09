-- #285 (09/10/2026): rateio_filhas_nao_somam_a_mae passa a acender também quando o BRUTO não bate.
-- Reescreve só o bloco da verificação c20 dentro de _run_invariant_checks_raw (resto da definição intacto).
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public._run_invariant_checks_raw()'::regprocedure);
  n := replace(d,
'           ROUND(m.amount - f.soma, 2) AS diferenca
      FROM public.transactions m
      JOIN LATERAL (
        SELECT SUM(c.amount) AS soma, count(*) AS n_filhas',
'           ROUND(m.amount - f.soma, 2) AS diferenca,
           ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) AS bruto_mae,
           f.soma_bruto AS soma_bruto_filhas
      FROM public.transactions m
      JOIN LATERAL (
        SELECT SUM(c.amount) AS soma, count(*) AS n_filhas,
               SUM(ROUND((c.amount * (1 + COALESCE(c.iva_rate,0) / 100.0))::numeric, 2)) AS soma_bruto');
  n := replace(n,
'       AND abs(m.amount - f.soma) > 0.05
  )',
'       AND (abs(m.amount - f.soma) > 0.05
            -- #285 (09/10/2026): também acende quando o BRUTO não bate (IVA divergente mãe/filhas).
            OR abs(ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) - f.soma_bruto) > 0.05)
  )');
  IF n = d OR position('soma_bruto_filhas' in n) = 0 OR position('OR abs(ROUND((m.amount' in n) = 0 THEN
    RAISE EXCEPTION 'bloco rateio_filhas_nao_somam_a_mae não encontrado';
  END IF;
  EXECUTE n;
END $mig$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO service_role;