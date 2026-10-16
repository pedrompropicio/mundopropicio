CREATE OR REPLACE FUNCTION public.club_welcome_reserve(p_company_id uuid, p_site_id uuid, p_member_id uuid, p_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM club_members m JOIN portal_sites s ON s.id = m.site_id
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
REVOKE ALL ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) TO service_role;