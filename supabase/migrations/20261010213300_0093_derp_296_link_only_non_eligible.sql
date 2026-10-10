-- #296: ao confirmar, só as deduções elegíveis (paid_amount enviado) são liquidadas;
-- ligações já existentes fora da lista elegível (paid_amount null) ficam só ligadas, como antes.
DO $$
DECLARE d text; old text := 'SELECT id, reversed_at INTO v_tx FROM public.transactions WHERE id = r.id FOR UPDATE;';
BEGIN
  d := pg_get_functiondef('public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text)'::regprocedure);
  IF position(old in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  d := replace(d, old, 'IF r.paid IS NULL THEN
          UPDATE public.transactions SET settlement_id = v_id WHERE id = r.id;
          CONTINUE;
        END IF;
        ' || old);
  EXECUTE d;
END $$;