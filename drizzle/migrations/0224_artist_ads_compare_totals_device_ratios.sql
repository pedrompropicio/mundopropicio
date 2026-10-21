SET LOCAL lock_timeout = '5s';
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
  a1 text := $a$        ORDER BY platform, cur),'[]'::jsonb) FROM hvm),$a$;
  b1 text := $b$        ORDER BY platform, cur),'[]'::jsonb) FROM (
          SELECT * FROM hvm
          UNION ALL
          -- total por moeda: soma só a mesma moeda; rácios a partir das somas; chegadas sem moeda ficam fora
          SELECT 'total', t.cur, t.g1, t.i1, t.c1, t.n1, t.g0, t.i0, t.c0, t.n0,
            CASE WHEN t.i1>0 THEN t.c1::numeric/t.i1*100 END, CASE WHEN t.i0>0 THEN t.c0::numeric/t.i0*100 END,
            CASE WHEN t.c1>0 THEN t.g1/t.c1 END, CASE WHEN t.c0>0 THEN t.g0/t.c0 END,
            CASE WHEN t.i1>0 THEN t.g1/t.i1*1000 END, CASE WHEN t.i0>0 THEN t.g0/t.i0*1000 END,
            CASE WHEN t.n1>0 THEN t.g1/t.n1 END, CASE WHEN t.n0>0 THEN t.g0/t.n0 END
          FROM (SELECT cur, sum(g1) g1, sum(i1) i1, sum(c1) c1, sum(n1) n1, sum(g0) g0, sum(i0) i0, sum(c0) c0, sum(n0) n0
                FROM hvo WHERE cur IS NOT NULL GROUP BY cur) t
        ) hvm),$b$;
  a2 text := $a$      FROM a WHERE cur IS NULL AND ts >= v_from_ts AND ts < v_to_ts GROUP BY platform
  )$a$;
  b2 text := $b$      FROM a WHERE cur IS NULL AND ts >= v_from_ts AND ts < v_to_ts GROUP BY platform
    UNION ALL
    SELECT 'hoje_vs_ontem: ' || sum(n1 + n0) || ' chegadas sem moeda atribuível fora do total (hoje ' || sum(n1) || ', ontem ' || sum(n0) || ')'
      FROM hvo WHERE cur IS NULL HAVING sum(n1 + n0) > 0
  )$b$;
  a3 text := $a$'impressoes',imp,'cliques',clk,'gasto',round(g,2),'chegadas',n,$a$;
  b3 text := $b$'impressoes',imp,'cliques',clk,'gasto',round(g,2),'chegadas',n,
        'ctr', CASE WHEN imp>0 AND clk IS NOT NULL THEN round(clk::numeric/imp*100,4) END,
        'cpc', CASE WHEN clk>0 AND g IS NOT NULL THEN round(g/clk,4) END,
        'cpm', CASE WHEN imp>0 AND g IS NOT NULL THEN round(g/imp*1000,4) END,$b$;
BEGIN
  IF (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 THEN RAISE EXCEPTION 'guard: âncora 1'; END IF;
  IF (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 THEN RAISE EXCEPTION 'guard: âncora 2'; END IF;
  IF (length(d) - length(replace(d, a3, ''))) / length(a3) <> 1 THEN RAISE EXCEPTION 'guard: âncora 3'; END IF;
  EXECUTE replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
END
$patch$;