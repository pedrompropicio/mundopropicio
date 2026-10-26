ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
COMMENT ON COLUMN public.club_members.last_seen_at IS 'Última visita identificada ao portal (sessão válida), para conservação de dados 30/36 meses.';

CREATE TABLE public.club_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  message_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('opened','clicked')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.club_email_events IS 'Aberturas/cliques Resend do Clube Newgang, sem email nem URL; ligado ao membro via email_send_log.message_id.';
CREATE INDEX club_email_events_message_idx ON public.club_email_events (message_id, occurred_at DESC);
REVOKE ALL ON public.club_email_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.club_email_events TO service_role;
ALTER TABLE public.club_email_events ENABLE ROW LEVEL SECURITY;