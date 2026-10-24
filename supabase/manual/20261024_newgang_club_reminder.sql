-- Lembrete de confirmação do Clube Newgang (passo 2/4, R1: ficheiro escrito, NÃO aplicado).
-- Aplicação no passo 3 (R2, Sim próprio) via ferramenta de migração, byte-a-byte, como drizzle/migrations/0239.
-- Só objetos novos: não toca club_welcome_reservations, club_members nem funções existentes.
-- Um lembrete por membro (PK member_id); unknown nunca é repetido; error_pre_send até 3 tentativas.

CREATE TABLE public.club_reminder_reservations(
  member_id uuid PRIMARY KEY REFERENCES public.club_members(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  company_id uuid NOT NULL,
  message_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','enqueued','error_pre_send','unknown')),
  attempt_count integer NOT NULL DEFAULT 1,
  retry_safe boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz,
  error text,
  test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.club_reminder_reservations TO service_role;
ALTER TABLE public.club_reminder_reservations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.club_reminder_reservations IS 'Lembrete de confirmação Newgang: 1 por membro; só service_role; unknown nunca repetido.';

-- Motivo único de elegibilidade (mesma regra na reserva, nos candidatos e no resumo).
CREATE FUNCTION public._club_reminder_reason(p_company_id uuid, p_site_id uuid, p_member_id uuid, p_test boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m record;
BEGIN
  SELECT cm.email, cm.confirmed_at, cm.created_at INTO m
    FROM public.club_members cm JOIN public.portal_sites s ON s.id = cm.site_id
   WHERE cm.id = p_member_id AND cm.site_id = p_site_id AND s.company_id = p_company_id;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;
  IF m.confirmed_at IS NOT NULL THEN RETURN 'confirmed'; END IF;
  IF m.email IS NULL OR btrim(m.email) = '' THEN RETURN 'no_email'; END IF;
  IF EXISTS (SELECT 1 FROM public.suppressed_emails se
              WHERE se.email = lower(btrim(m.email)) AND se.company_id = p_company_id) THEN RETURN 'suppressed'; END IF;
  IF NOT coalesce(p_test, false) AND m.created_at > clock_timestamp() - interval '48 hours' THEN RETURN 'too_recent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log l WHERE l.template_name = 'newgang_club_welcome'
                  AND l.metadata->>'member_id' = p_member_id::text AND l.status = 'sent') THEN
    IF EXISTS (SELECT 1 FROM public.email_send_log l WHERE l.template_name = 'newgang_club_welcome'
                AND l.metadata->>'member_id' = p_member_id::text AND l.status = 'dlq') THEN RETURN 'welcome_dlq'; END IF;
    IF EXISTS (SELECT 1 FROM public.email_send_log l WHERE l.template_name = 'newgang_club_welcome'
                AND l.metadata->>'member_id' = p_member_id::text) THEN RETURN 'welcome_not_sent'; END IF;
    RETURN 'welcome_none';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_reminder_reservations r WHERE r.member_id = p_member_id) THEN RETURN 'already_reserved'; END IF;
  RETURN 'ok';
END $$;

-- Reserva atómica antes do envio. Bloqueia a linha do membro (serializa com a confirmação) e reverifica tudo.
-- Devolve 'reserved' ou o motivo da recusa.
CREATE FUNCTION public.club_reminder_reserve(p_company_id uuid, p_site_id uuid, p_member_id uuid, p_message_id text, p_test boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reason text; v_ok boolean;
BEGIN
  IF p_message_id IS DISTINCT FROM ('ng-reminder-' || p_member_id::text) THEN RETURN 'invalid_message_id'; END IF;
  PERFORM 1 FROM public.club_members WHERE id = p_member_id FOR UPDATE;
  v_reason := public._club_reminder_reason(p_company_id, p_site_id, p_member_id, coalesce(p_test, false));
  IF v_reason = 'ok' THEN
    INSERT INTO public.club_reminder_reservations(member_id, site_id, company_id, message_id, test)
    VALUES (p_member_id, p_site_id, p_company_id, p_message_id, coalesce(p_test, false))
    ON CONFLICT (member_id) DO NOTHING RETURNING true INTO v_ok;
    RETURN CASE WHEN v_ok THEN 'reserved' ELSE 'already_reserved' END;
  END IF;
  IF v_reason = 'already_reserved' THEN
    UPDATE public.club_reminder_reservations r SET status = 'reserved', attempt_count = r.attempt_count + 1,
           next_attempt_at = NULL, updated_at = clock_timestamp()
     WHERE r.member_id = p_member_id AND r.status = 'error_pre_send' AND r.retry_safe AND r.attempt_count < 3
       AND r.site_id = p_site_id AND r.company_id = p_company_id AND r.message_id = p_message_id
       AND coalesce(r.next_attempt_at, r.updated_at + interval '5 minutes') <= clock_timestamp()
    RETURNING true INTO v_ok;
    IF v_ok THEN RETURN 'reserved'; END IF;
  END IF;
  RETURN v_reason;
END $$;

CREATE FUNCTION public.club_reminder_mark(p_member_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('enqueued','error_pre_send','unknown') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE public.club_reminder_reservations SET status = p_status, error = left(p_error, 300), updated_at = clock_timestamp(),
         retry_safe = (p_status = 'error_pre_send'),
         next_attempt_at = CASE WHEN p_status = 'error_pre_send' AND attempt_count < 3 THEN clock_timestamp() + interval '5 minutes' END
   WHERE member_id = p_member_id AND (status = 'reserved' OR (status = 'unknown' AND p_status = 'enqueued'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- Candidatos do lote (máx. 500), ordem estável por antiguidade.
CREATE FUNCTION public.club_reminder_candidates(p_company_id uuid, p_site_id uuid, p_limit integer)
RETURNS TABLE(member_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cm.id FROM public.club_members cm
   WHERE cm.site_id = p_site_id AND cm.confirmed_at IS NULL
     AND cm.created_at <= clock_timestamp() - interval '48 hours'
     AND public._club_reminder_reason(p_company_id, p_site_id, cm.id, false) = 'ok'
   ORDER BY cm.created_at, cm.id
   LIMIT least(greatest(coalesce(p_limit, 0), 0), 500)
$$;

-- Resumo sem dados pessoais: contagens por motivo, member_id dos dlq/sem registo, estados das reservas.
CREATE FUNCTION public.club_reminder_summary(p_company_id uuid, p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH r AS (
    SELECT cm.id, public._club_reminder_reason(p_company_id, p_site_id, cm.id, false) AS reason
      FROM public.club_members cm WHERE cm.site_id = p_site_id AND cm.confirmed_at IS NULL)
  SELECT jsonb_build_object(
    'unconfirmed', (SELECT count(*) FROM r),
    'by_reason', (SELECT coalesce(jsonb_object_agg(reason, n), '{}'::jsonb) FROM (SELECT reason, count(*) n FROM r GROUP BY reason) x),
    'welcome_dlq_ids', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM r WHERE reason = 'welcome_dlq'),
    'welcome_none_ids', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM r WHERE reason = 'welcome_none'),
    'reservations', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                       FROM (SELECT status, count(*) n FROM public.club_reminder_reservations WHERE site_id = p_site_id GROUP BY status) y))
$$;

REVOKE ALL ON FUNCTION public._club_reminder_reason(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_reminder_reserve(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_reminder_mark(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_reminder_candidates(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_reminder_summary(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._club_reminder_reason(uuid,uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_reminder_reserve(uuid,uuid,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_reminder_mark(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_reminder_candidates(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_reminder_summary(uuid,uuid) TO service_role;
