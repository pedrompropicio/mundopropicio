ALTER TABLE public.camarim_sessions
  ADD COLUMN IF NOT EXISTS integrated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.camarim_sessions.integrated_by IS 'Utilizador que executou a integração financeira da sessão (modelo híbrido).';