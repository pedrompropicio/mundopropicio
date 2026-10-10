-- D-ERP219 (#295/#246): prova das RPCs. Tudo desfeito (exceção final → rollback).
-- Resultado 10/10/2026: editor 42501 nas duas; admin apaga mãe+11 filhas (lixo +1),
-- estorna fecho (2 pernas, 7 despesas, 7 pagamentos, 1 atribuição); BP: sem obs 22023,
-- com obs passa + 1 forecast_audit_log, abaixo do realizado 22023.
DO $$
DECLARE r jsonb; out text := '';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"88746956-80af-4331-b93a-d73e6ba3d041","role":"authenticated"}', true);
  BEGIN PERFORM public.delete_transaction_cascade('b18b54d5-4140-4838-935b-579ac103ac39','teste',true,'teste');
  EXCEPTION WHEN others THEN out := out||'DEL editor '||SQLSTATE||' | '; END;
  BEGIN PERFORM public.reverse_ticket_office_settlement('bbfd5de7-5529-4f4c-b457-a01e7caaf8b1','teste','teste');
  EXCEPTION WHEN others THEN out := out||'REV editor '||SQLSTATE||' | '; END;
  PERFORM set_config('request.jwt.claims', '{"sub":"d8e502f7-9ceb-4dae-bd73-7291832d0d6f","role":"authenticated"}', true);
  r := public.delete_transaction_cascade('b18b54d5-4140-4838-935b-579ac103ac39','teste',true,'teste');
  out := out||'DEL admin '||(r->'counts')::text||' | ';
  r := public.reverse_ticket_office_settlement('bbfd5de7-5529-4f4c-b457-a01e7caaf8b1','teste','teste');
  out := out||'REV admin '||(r->'counts')::text||' | ';
  PERFORM set_config('mp.bp_change_observation','subida teste',true);
  UPDATE event_forecasts SET amount = 4000 WHERE id='d1b6e152-e567-408a-b3f5-ef215a38a49a';
  BEGIN PERFORM public.set_forecast_amount_observed('d1b6e152-e567-408a-b3f5-ef215a38a49a',3600,NULL);
  EXCEPTION WHEN others THEN out := out||'BP sem obs '||SQLSTATE||' | '; END;
  PERFORM public.set_forecast_amount_observed('d1b6e152-e567-408a-b3f5-ef215a38a49a',3600,'teste reducao');
  BEGIN PERFORM public.set_forecast_amount_observed('d1b6e152-e567-408a-b3f5-ef215a38a49a',3000,'abaixo');
  EXCEPTION WHEN others THEN out := out||'BP abaixo '||SQLSTATE; END;
  RAISE EXCEPTION 'ROLLBACK_OK %', out;
END $$;
