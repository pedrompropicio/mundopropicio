-- ============================================================================
-- GRANTs para o sync de criativos EVENT-AWARE (crm-meta-sync-creatives).
--
-- PORQUÊ: o sync passou a ser event-aware (Step 0 da função) — para descobrir
-- que criativos pertencem a eventos ATIVOS, consulta:
--   • public.events                  (status='active' AND date >= CURRENT_DATE)
--   • crm.meta_campaign_snapshot     (linked_event_id → external_campaign_id)
-- O cron corre como role `service_role`, que NÃO tinha SELECT nestas tabelas.
-- Resultado em runtime: "permission denied for table meta_campaign_snapshot"
-- (e o mesmo aconteceria em public.events). Estes GRANTs resolvem-no.
--
-- Em Live foram aplicados à mão; esta migration versiona-os e cobre o Test.
-- Idempotente: GRANT é no-op quando a permissão já existe.
-- ============================================================================

GRANT SELECT ON crm.meta_campaign_snapshot TO service_role;
GRANT SELECT ON public.events TO service_role;
