-- D-ERP276: read-only invitation state for the Coala confirmation page.
CREATE OR REPLACE FUNCTION public.estado_convite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  v_email text;
  v_status text;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT email, status INTO v_email, v_status
  FROM public.coala_invites
  WHERE token = p_token AND company_id = COALA;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF v_status = 'confirmed' THEN
    RETURN jsonb_build_object('status', 'confirmed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.coala_list_members WHERE email = v_email) THEN
    RETURN jsonb_build_object('status', 'on_list');
  END IF;
  RETURN jsonb_build_object('status', 'pending');
END
$function$;

REVOKE ALL ON FUNCTION public.estado_convite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estado_convite(text) TO anon, authenticated;