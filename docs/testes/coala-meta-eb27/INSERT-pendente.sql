-- NÃO EXECUTADO. Exige autorização separada do Pedro.
INSERT INTO public.meta_custom_audiences
  (company_id, connection_id, audience_id_meta, name, enabled, filters)
SELECT
  '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid,
  l.id, '52521842310116', 'P_EB27_LISTA', false,
  '{"source":"coala_list:eb2027","replace":true}'::jsonb
FROM crm.ad_platform_account_links l
WHERE l.id = '1461bd40-d639-43ac-bc4c-f38cdc9b0c12'::uuid
  AND l.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid
  AND l.ad_account_id = 'act_4090914934483114'
  AND l.enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM public.meta_custom_audiences a
    WHERE a.audience_id_meta = '52521842310116'
  )
RETURNING id, name, enabled, filters;
-- Exigir exatamente 1 linha; se 0, revalidar ligação/duplicação, não adaptar IDs.
-- Não ativar nem modificar o cron. O cron atual omitindo dry_run continuará em simulação.