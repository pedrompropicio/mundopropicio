-- #196 — conversão em Extra do Sócio atómica (D-ERP218).
-- Corre dentro de BEGIN … ROLLBACK: não deixa nada na base.
-- Editor de teste: 88746956-… (editor na Mundo Propício, sem admin).
BEGIN;
UPDATE public.profiles SET active_company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
 WHERE id = '88746956-80af-4331-b93a-d73e6ba3d041';

CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT e.status AS ev_status, t.id AS tx_id, t.event_id,
       (SELECT ep.id FROM public.event_partners ep WHERE ep.event_id = e.id LIMIT 1) AS partner_id
  FROM public.events e
  JOIN LATERAL (SELECT t.* FROM public.transactions t
                 WHERE t.event_id = e.id AND t.type = 'expense' AND NOT coalesce(t.is_transitory, false)
                   AND t.reversed_at IS NULL LIMIT 1) t ON true
 WHERE e.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND e.status IN ('completed', 'active')
   AND EXISTS (SELECT 1 FROM public.event_partners ep WHERE ep.event_id = e.id)
   AND NOT EXISTS (SELECT 1 FROM public.partner_advance_expenses x WHERE x.transaction_id = t.id);
-- uma linha por estado
DELETE FROM _alvo a USING _alvo b WHERE a.ev_status = b.ev_status AND a.tx_id > b.tx_id;
GRANT SELECT ON _alvo TO authenticated;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '88746956-80af-4331-b93a-d73e6ba3d041', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- (a) evento concluído → erro claro (P0403) e nada gravado
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM _alvo WHERE ev_status = 'completed';
  BEGIN
    PERFORM public.convert_transaction_to_partner_extra(r.tx_id, r.partner_id, r.event_id, NULL, true);
    RAISE EXCEPTION 'FALHOU: devia ter recusado';
  EXCEPTION WHEN SQLSTATE 'P0403' THEN
    RAISE NOTICE 'a OK: %', SQLERRM;
  END;
END $$;
SELECT 'a_concluido' AS caso, t.is_transitory,
       (SELECT count(*) FROM public.partner_advance_expenses x WHERE x.transaction_id = t.id) AS extras
  FROM public.transactions t WHERE t.id = (SELECT tx_id FROM _alvo WHERE ev_status = 'completed');

-- (b) evento aberto → as duas escritas
SELECT public.convert_transaction_to_partner_extra(tx_id, partner_id, event_id, NULL, true) IS NOT NULL AS b_ok
  FROM _alvo WHERE ev_status = 'active';
SELECT 'b_aberto' AS caso, t.is_transitory, t.transitory_reason,
       (SELECT count(*) FROM public.partner_advance_expenses x WHERE x.transaction_id = t.id) AS extras
  FROM public.transactions t WHERE t.id = (SELECT tx_id FROM _alvo WHERE ev_status = 'active');

ROLLBACK;
