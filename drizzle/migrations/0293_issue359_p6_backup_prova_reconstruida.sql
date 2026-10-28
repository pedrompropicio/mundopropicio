-- #359 P6 · D-ERP333 · D-ERP332 · 28/10/2026: regista em migração versionada a tabela de cópia dos 75 leads do Coala
-- cuja prova de email foi reconstruída a 28/10/2026 (o backfill está registado em D-ERP333 e na #359; não faz parte desta migração).
-- Em Live a tabela já existe igual: este ficheiro é no-op (CREATE ... IF NOT EXISTS, RLS e GRANT já iguais).
-- Numa base vazia cria a tabela vazia. Só estrutura: nenhum dado é lido, alterado ou apagado.
CREATE TABLE IF NOT EXISTS public.bkp_359_p6_prova_reconstruida (
  id uuid,
  email text,
  created_at timestamptz,
  consent_email boolean,
  consent_email_text_version text,
  consent_decided_at timestamptz,
  backup_at timestamptz
);

ALTER TABLE public.bkp_359_p6_prova_reconstruida ENABLE ROW LEVEL SECURITY;

-- Mesmos privilégios de Live (sem políticas: com RLS ligado, anon e authenticated não leem nada).
GRANT ALL ON TABLE public.bkp_359_p6_prova_reconstruida TO anon, authenticated, service_role;
