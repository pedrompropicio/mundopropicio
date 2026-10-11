-- D-ERP249 — caso Newgang 2025/2026/2027 na ligação automática Meta.
-- Correr numa transação; tudo é desfeito no fim.
BEGIN;

-- 1) Pontuação pura: o ano tem de coincidir quando ambos o têm.
DO $$
BEGIN
  ASSERT crm.meta_campaign_event_score('[Vendas] Newgang Festival 2025 - Lisboa', 'Newgang Festival 2027') IS NULL, '2025 não liga a 2027';
  ASSERT crm.meta_campaign_event_score('Newgang 2026 | Conversões', 'Newgang Festival 2027') IS NULL, '2026 não liga a 2027';
  ASSERT crm.meta_campaign_event_score('Newgang 2026 | Conversões', 'Newgang Festival 2026') = 1, '2026 liga a 2026';
  ASSERT crm.meta_campaign_event_score('[F] Newgang 2027 Venda Geral', 'Newgang Festival 2027') = 1, '2027 liga a 2027';
  ASSERT crm.meta_campaign_event_score('RG Santa Maria da Feira', 'RG - Santa Maria da Feira') IS NULL, 'cidade não conta';
END $$;

-- 2) Função completa: campanha já ligada ao 2026 nunca muda; pausada antiga não liga;
--    empate entre dois eventos vai para ambiguous.
DO $$
DECLARE
  v_co uuid := gen_random_uuid();
  e26 uuid := gen_random_uuid(); e27 uuid := gen_random_uuid(); e27b uuid := gen_random_uuid();
  r record;
BEGIN
  INSERT INTO public.companies(id, name, slug) VALUES (v_co, 'teste-derp249', 'teste-derp249-' || left(v_co::text, 8));
  INSERT INTO public.events(id, company_id, name, status, date, created_at) VALUES
    (e26, v_co, 'Newgang Festival 2026', 'active', '2026-11-11', now() - interval '2 years'),
    (e27, v_co, 'Newgang Festival 2027', 'active', '2027-11-11', now());
  INSERT INTO crm.meta_campaign_snapshot(id, company_id, name, status, effective_status, created_time, linked_event_id) VALUES
    ('t-ng25', v_co, '[Vendas] Newgang 2025', 'PAUSED', 'PAUSED', now() - interval '1 year', NULL),
    ('t-ng26', v_co, 'Newgang 2026 | Conversões', 'PAUSED', 'PAUSED', now() - interval '1 year', e26),
    ('t-ng27', v_co, 'Newgang 2027 Venda Geral', 'ACTIVE', 'ACTIVE', now(), NULL),
    ('t-old',  v_co, 'Newgang Teaser', 'PAUSED', 'PAUSED', now() - interval '3 years', NULL);

  SELECT * INTO r FROM crm.auto_link_meta_campaigns_to_events__impl(v_co);
  ASSERT (SELECT linked_event_id FROM crm.meta_campaign_snapshot WHERE id='t-ng26') = e26, 'ligação existente mantém-se';
  ASSERT (SELECT linked_event_id FROM crm.meta_campaign_snapshot WHERE id='t-ng25') IS NULL, '2025 não liga';
  ASSERT (SELECT linked_event_id FROM crm.meta_campaign_snapshot WHERE id='t-ng27') = e27, '2027 liga ao 2027';
  ASSERT (SELECT linked_event_id FROM crm.meta_campaign_snapshot WHERE id='t-old') IS NULL, 'pausada antiga não liga';

  INSERT INTO public.events(id, company_id, name, status, date) VALUES (e27b, v_co, 'Newgang Festival 2027 Porto', 'active', '2027-11-12');
  INSERT INTO crm.meta_campaign_snapshot(id, company_id, name, status, effective_status, created_time)
    VALUES ('t-amb', v_co, 'Newgang Venda', 'ACTIVE', 'ACTIVE', now());
  SELECT * INTO r FROM crm.auto_link_meta_campaigns_to_events__impl(v_co);
  ASSERT (SELECT linked_event_id FROM crm.meta_campaign_snapshot WHERE id='t-amb') IS NULL, 'empate não liga';
  ASSERT jsonb_path_exists(r.ambiguous, '$[*] ? (@.campaign_id == "t-amb")'), 'empate em ambiguous';
END $$;

ROLLBACK;
