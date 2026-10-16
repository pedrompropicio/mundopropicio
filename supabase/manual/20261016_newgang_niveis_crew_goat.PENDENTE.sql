-- PENDENTE — NÃO APLICAR sem "Sim" do Pedro e sem os criativos hero-crew-v1/hero-goat-v1
-- carregados + WALLET_RENAMED_ARTWORK_READY=true deployado (senão o cartão Crew mostra "ELITE").
-- Site f8ce23a5-a27a-4893-9b7a-d6337d84b168 · empresa 7c858982-6ccd-47ca-bd65-e0dd3eebf01c.
-- Só muda name; min_points (500/1500), benefit, ids e pontos ficam iguais. Gang (0) não muda.

-- Verificação prévia (deve devolver exatamente 2 linhas com os nomes antigos):
SELECT id, name, min_points FROM public.club_levels
 WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168'
   AND ((id = '32083504-73fa-41f0-b826-68837c82040e' AND name = 'Elite' AND min_points = 500)
     OR (id = '2aa5a1d5-3c59-4684-8b18-06c239bc88e5' AND name = 'Lenda' AND min_points = 1500));

-- Aplicação (falha e reverte se não forem exatamente 2 linhas):
DO $$
DECLARE n int;
BEGIN
  UPDATE public.club_levels SET name = CASE id
      WHEN '32083504-73fa-41f0-b826-68837c82040e' THEN 'Crew'
      WHEN '2aa5a1d5-3c59-4684-8b18-06c239bc88e5' THEN 'Goat' END
   WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168'
     AND ((id = '32083504-73fa-41f0-b826-68837c82040e' AND name = 'Elite' AND min_points = 500)
       OR (id = '2aa5a1d5-3c59-4684-8b18-06c239bc88e5' AND name = 'Lenda' AND min_points = 1500));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'esperadas 2 linhas, alteradas %', n; END IF;
END $$;

-- Verificação posterior (3 linhas: Gang 0, Crew 500, Goat 1500):
SELECT id, name, min_points FROM public.club_levels
 WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' ORDER BY min_points;

-- REVERSÃO (mesmas guardas, sentido inverso):
-- DO $$ DECLARE n int; BEGIN
--   UPDATE public.club_levels SET name = CASE id
--       WHEN '32083504-73fa-41f0-b826-68837c82040e' THEN 'Elite'
--       WHEN '2aa5a1d5-3c59-4684-8b18-06c239bc88e5' THEN 'Lenda' END
--    WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168'
--      AND ((id = '32083504-73fa-41f0-b826-68837c82040e' AND name = 'Crew' AND min_points = 500)
--        OR (id = '2aa5a1d5-3c59-4684-8b18-06c239bc88e5' AND name = 'Goat' AND min_points = 1500));
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF n <> 2 THEN RAISE EXCEPTION 'esperadas 2 linhas, alteradas %', n; END IF;
-- END $$;
