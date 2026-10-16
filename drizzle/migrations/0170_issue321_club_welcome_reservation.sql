CREATE TABLE IF NOT EXISTS public.club_welcome_reservations (
  member_id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  company_id uuid NOT NULL,
  message_id text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','enqueued','error_pre_send','unknown','legacy_sent')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.club_welcome_reservations IS '#321: reserva atómica 1 welcome do Clube por membro, adquirida ANTES do envio. Nunca libertada automaticamente; recuperação manual.';
REVOKE ALL ON public.club_welcome_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.club_welcome_reservations TO service_role;
ALTER TABLE public.club_welcome_reservations ENABLE ROW LEVEL SECURITY;

-- Backfill sem envio: membros que já têm welcome registado ficam bloqueados.
INSERT INTO public.club_welcome_reservations (member_id, site_id, company_id, message_id, status)
SELECT DISTINCT ON (m.id) m.id, m.site_id, l.company_id, l.message_id, 'legacy_sent'
FROM public.email_send_log l
JOIN public.club_members m ON m.id::text = l.metadata->>'member_id'
WHERE l.template_name = 'newgang_club_welcome' AND l.company_id IS NOT NULL
ORDER BY m.id, l.created_at
ON CONFLICT (member_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.club_welcome_reserve(p_company_id uuid, p_site_id uuid, p_member_id uuid, p_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean := false;
BEGIN
  -- membro tem de pertencer ao site/empresa indicados
  IF NOT EXISTS (SELECT 1 FROM club_members m JOIN club_sites s ON s.id = m.site_id
                 WHERE m.id = p_member_id AND m.site_id = p_site_id AND s.company_id = p_company_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM email_send_log WHERE template_name = 'newgang_club_welcome'
             AND metadata->>'member_id' = p_member_id::text) THEN
    INSERT INTO club_welcome_reservations(member_id, site_id, company_id, message_id, status)
    VALUES (p_member_id, p_site_id, p_company_id, p_message_id, 'legacy_sent') ON CONFLICT DO NOTHING;
    RETURN false;
  END IF;
  INSERT INTO club_welcome_reservations(member_id, site_id, company_id, message_id)
  VALUES (p_member_id, p_site_id, p_company_id, p_message_id)
  ON CONFLICT (member_id) DO NOTHING
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.club_welcome_mark(p_member_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF p_status NOT IN ('enqueued','error_pre_send','unknown') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE club_welcome_reservations SET status = p_status, error = left(p_error, 300), updated_at = now()
  WHERE member_id = p_member_id AND status IN ('reserved','unknown');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

REVOKE ALL ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_welcome_mark(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_welcome_mark(uuid,text,text) TO service_role;