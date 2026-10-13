-- D-ERP265: corre numa transação e desfaz tudo.
BEGIN;
DO $$
DECLARE v_master uuid := 'e103ed22-d53c-4eb7-99e8-a6cdbf1d2dfd'; v_city uuid := '3def1b85-0ed0-4166-b45d-3a4561564e15'; v_cfg uuid;
BEGIN
  -- 1) Master tem configuração → cidade recusada
  BEGIN
    INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES (v_city, 'TESTE', 'fixed');
    RAISE EXCEPTION 'FALHA: cidade aceite';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK cidade recusada: %', SQLERRM; END;
  -- 2) Cidade com configuração → Master recusado (tira a do Master dentro da transação)
  DELETE FROM public.event_cache_deductions WHERE cache_config_id IN (SELECT id FROM public.event_cache_configs WHERE event_id = v_master);
  DELETE FROM public.event_cache_configs WHERE event_id = v_master;
  INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES (v_city, 'TESTE', 'fixed');
  BEGIN
    INSERT INTO public.event_cache_configs (event_id, artist_name, cache_type) VALUES (v_master, 'TESTE', 'fixed');
    RAISE EXCEPTION 'FALHA: Master aceite';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK Master recusado: %', SQLERRM; END;
END $$;
ROLLBACK;
