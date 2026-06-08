-- ============================================================================
-- INVESTIGAÇÃO (read-only) — "Deive Leonardo - Lisboa" (01/10) com 0 campanhas.
-- Correr no Live SQL Editor. NÃO altera nada (só SELECT). O fix (UPDATE de
-- linked_event_id) fica para revisão do Pedro — ver o bloco comentado no fim.
-- ============================================================================

-- 1) O evento existe e está ativo?
SELECT id, name, status, date
FROM public.events
WHERE name ILIKE '%deive leonardo%';

-- 2) Quantas campanhas estão ligadas a esse evento? (esperado: 0 pelo report)
SELECT c.external_campaign_id, c.name, c.effective_status, c.linked_event_id
FROM crm.meta_campaign_snapshot c
JOIN public.events e ON e.id = c.linked_event_id
WHERE e.name ILIKE '%deive leonardo%';

-- 3) Há campanhas Meta cujo NOME refere "Deive" mas SEM linked_event_id?
--    (sinal de falta de link — campanhas existem mas nunca foram associadas.)
SELECT external_campaign_id, name, effective_status, linked_event_id
FROM crm.meta_campaign_snapshot
WHERE name ILIKE '%deive%'
ORDER BY linked_event_id NULLS FIRST, name;

-- 4) Dessas campanhas, há ads com criativos? (mede o impacto do link em falta.)
SELECT s.name AS campaign_name, COUNT(DISTINCT a.meta_creative_id) AS distinct_creatives
FROM crm.meta_campaign_snapshot s
JOIN crm.meta_ad_snapshot a ON a.external_campaign_id = s.external_campaign_id
WHERE s.name ILIKE '%deive%' AND a.meta_creative_id IS NOT NULL
GROUP BY s.name
ORDER BY distinct_creatives DESC;

-- ----------------------------------------------------------------------------
-- FIX PROPOSTO (NÃO correr sem revisão do Pedro): associar as campanhas certas
-- ao evento. Confirmar primeiro com as queries acima QUAIS external_campaign_id
-- são mesmo do Deive Leonardo (validar pelo nome/datas), e só depois:
--
--   UPDATE crm.meta_campaign_snapshot
--   SET linked_event_id = '<event_id do passo 1>'
--   WHERE external_campaign_id IN ('<id1>', '<id2>', ...);  -- ids confirmados
--
-- Depois disto, o sync event-aware passa a apanhar os criativos do Deive Leonardo.
-- ============================================================================
