-- Adicionar colunas em falta à company_invitations
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  ADD COLUMN IF NOT EXISTS accepted_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON public.company_invitations(token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON public.company_invitations(email);