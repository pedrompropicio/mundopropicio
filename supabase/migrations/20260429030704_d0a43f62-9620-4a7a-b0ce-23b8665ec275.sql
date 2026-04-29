
-- Fase 6 — Criar 2ª empresa de teste para validação cross-tenant
INSERT INTO public.companies (legal_name, display_name, slug, country, currency, timezone, status, theme_config)
VALUES (
  'Empresa Demo 2, Lda',
  'Demo 2',
  'demo-2',
  'PT',
  'EUR',
  'Europe/Lisbon',
  'active',
  '{"primary":"15 85% 55%","accent":"160 60% 45%"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
