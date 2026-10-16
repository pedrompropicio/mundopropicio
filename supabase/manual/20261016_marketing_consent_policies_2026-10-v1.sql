-- #322 — fonte versionada da configuração de política (já aplicada em Live a 16/10/2026 01:15:42 UTC). Idempotente, sem segredos.
-- TTL 180 dias = configuração TÉCNICA ainda não validada em rollout (confirmar com o Pedro). Política desconhecida/retirada => grant recusado.
-- Retirar uma versão: UPDATE ... SET valid_to = now() (bloqueia captura e envio de imediato); nunca DELETE.
INSERT INTO public.marketing_consent_policies (portal, policy_version, valid_from, valid_to, ttl_days) VALUES
  ('mp',      '2026-10-v1', '2026-10-16 01:15:42.349479+00', NULL, 180),
  ('coala',   '2026-10-v1', '2026-10-16 01:15:42.349479+00', NULL, 180),
  ('newgang', '2026-10-v1', '2026-10-16 01:15:42.349479+00', NULL, 180)
ON CONFLICT (portal, policy_version) DO NOTHING;
