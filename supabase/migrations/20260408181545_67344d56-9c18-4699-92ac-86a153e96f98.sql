-- Add 'partner' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';

-- Create partner_event_access table
CREATE TABLE public.partner_event_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.partner_event_access ENABLE ROW LEVEL SECURITY;

-- Admin can manage all access records
CREATE POLICY "Partner access manageable by admin"
  ON public.partner_event_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view access records (partner needs to check own access)
CREATE POLICY "Partner access viewable by authenticated"
  ON public.partner_event_access
  FOR SELECT
  TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_partner_event_access_updated_at
  BEFORE UPDATE ON public.partner_event_access
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function: check if a user has active access to an event
CREATE OR REPLACE FUNCTION public.has_partner_access(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_event_access
    WHERE user_id = _user_id
      AND event_id = _event_id
      AND is_active = true
  )
$$;