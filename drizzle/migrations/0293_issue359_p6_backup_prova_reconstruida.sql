-- #359 P6 · D-ERP333 · D-ERP332 · 28/10/2026: regista em migração versionada o backfill da prova de email dos 75 leads do Coala
-- (26/10 10:32 UTC a 28/10/2026) e a tabela de cópia que o acompanha. Em Live já está tudo aplicado: este ficheiro é no-op
-- (CREATE ... IF NOT EXISTS, RLS e GRANT já iguais, UPDATE sem linhas por já não haver versão nula nos ids da cópia).
-- Numa base vazia cria a tabela vazia e o UPDATE não afeta nada. Nada é apagado.
-- Texto das caixas `coala-form-2026-10-v1` inalterado desde 21/09/2026 (src/i18n/coala/copy.ts do portal).
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

-- Backfill limitado aos ids da cópia e idempotente: só toca em quem ainda não tem versão nem data de decisão.
UPDATE public.lead_capture l
SET consent_email_text_version = 'coala-form-2026-10-v1',
    consent_decided_at = l.created_at
WHERE l.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid
  AND l.id IN (SELECT b.id FROM public.bkp_359_p6_prova_reconstruida b)
  AND l.consent_email IS TRUE
  AND l.consent_email_text_version IS NULL
  AND l.consent_decided_at IS NULL;
