
-- Create event_sessions table
CREATE TABLE public.event_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Sessão 1',
  start_time TIME NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Sessions viewable by authenticated"
  ON public.event_sessions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Sessions insertable by admin or manager"
  ON public.event_sessions FOR INSERT
  TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Sessions updatable by admin or manager"
  ON public.event_sessions FOR UPDATE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Sessions deletable by admin or manager"
  ON public.event_sessions FOR DELETE
  TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
  );

-- Timestamp trigger
CREATE TRIGGER update_event_sessions_updated_at
  BEFORE UPDATE ON public.event_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add session_id to ticket zones (nullable for backward compatibility)
ALTER TABLE public.event_ticket_zones
  ADD COLUMN session_id UUID NULL REFERENCES public.event_sessions(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_event_sessions_event_id ON public.event_sessions(event_id);
CREATE INDEX idx_event_ticket_zones_session_id ON public.event_ticket_zones(session_id);
