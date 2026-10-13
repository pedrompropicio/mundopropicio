-- D-ERP265: corre numa transação e desfaz tudo.
BEGIN;
DO $$
DECLARE v_city uuid := '3def1b85-0ed0-4166-b45d-3a4561564e15';
BEGIN
  -- 1) Master tem configuração → cidade recusada
  BEGIN
    INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES (v_city, 'TESTE', 'fixed');
    RAISE EXCEPTION 'FALHA: cidade aceite';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK cidade recusada: %', SQLERRM; END;
  -- 2) Cidade com configuração → Master recusado (Master sem cachê, só dentro da transação)
  INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES ('7a5a4216-afc1-487d-895f-d39b802ab9c9', 'TESTE', 'fixed');
  BEGIN
    INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES ('e8c7594d-474b-4fcc-b4c6-126e93ab11fd', 'TESTE', 'fixed');
    RAISE EXCEPTION 'FALHA: Master aceite';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK Master recusado: %', SQLERRM; END;
END $$;
ROLLBACK;
