-- #475/#457 — ARTEFACTO DE ENSAIO, NÃO É MIGRAÇÃO APLICÁVEL.
-- Não instalado; não chamado pelo produto. Integração, qualificação e promoção
-- pendentes. Executar apenas no PGlite descartável autorizado pelo despacho.
-- Interface matemática interna: cêntimos inteiros e pesos inteiros (EUR x 10000).
-- Não é contrato JSON/number, conversor monetário, nem validação de plano RPC.
-- Pesos zero são aceites só neste domínio matemático.
CREATE FUNCTION pg_temp.issue475_original_allocator(
  p_total numeric, p_weights numeric[]
) RETURNS numeric[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
PARALLEL SAFE
SET search_path = pg_catalog
AS $allocator$
DECLARE
  v_limit CONSTANT numeric := 9007199254740991;
  v_sum numeric := 0;
  v_weight numeric;
  v_result numeric[];
BEGIN
  IF p_total IS NULL OR p_total::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'invalid_total' USING ERRCODE = '22023';
  END IF;
  IF p_total < 0 OR p_total > v_limit OR trunc(p_total) <> p_total THEN
    RAISE EXCEPTION 'invalid_total' USING ERRCODE = '22023';
  END IF;
  IF p_weights IS NULL OR cardinality(p_weights) = 0
     OR array_ndims(p_weights) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid_weights' USING ERRCODE = '22023';
  END IF;
  -- Validate the whole array before any allocation, even for a zero total.
  FOR v_weight IN SELECT w FROM unnest(p_weights) AS u(w) LOOP
    IF v_weight IS NULL OR v_weight::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'invalid_weight' USING ERRCODE = '22023';
    END IF;
    IF v_weight < 0 OR v_weight > v_limit OR trunc(v_weight) <> v_weight THEN
      RAISE EXCEPTION 'invalid_weight' USING ERRCODE = '22023';
    END IF;
    v_sum := v_sum + v_weight;
  END LOOP;
  IF v_sum > v_limit OR (p_total > 0 AND v_sum = 0) THEN
    RAISE EXCEPTION 'invalid_weight_sum' USING ERRCODE = '22023';
  END IF;
  IF p_total = 0 THEN
    SELECT array_agg(0::numeric ORDER BY pos) INTO v_result
      FROM unnest(p_weights) WITH ORDINALITY AS u(w, pos);
    RETURN v_result;
  END IF;
  -- Products remain numeric, including products larger than bigint.
  -- div/mod never round the rational quota before comparing remainders.
  WITH quotas AS (
    SELECT pos, div(p_total * w, v_sum) AS base,
      mod(p_total * w, v_sum) AS remainder
    FROM unnest(p_weights) WITH ORDINALITY AS u(w, pos)
  ), ranked AS (
    SELECT pos, base,
      row_number() OVER (ORDER BY remainder DESC, pos ASC) AS priority,
      p_total - sum(base) OVER () AS leftover
    FROM quotas
  )
  SELECT array_agg(base + CASE WHEN priority <= leftover THEN 1 ELSE 0 END
                   ORDER BY pos)
    INTO v_result FROM ranked;
  RETURN v_result;
END;
$allocator$;
REVOKE ALL ON FUNCTION pg_temp.issue475_original_allocator(numeric, numeric[]) FROM PUBLIC;

-- Rollback exclusivo do ensaio (ou fechar a sessão descartável):
-- DROP FUNCTION pg_temp.issue475_original_allocator(numeric, numeric[]);
