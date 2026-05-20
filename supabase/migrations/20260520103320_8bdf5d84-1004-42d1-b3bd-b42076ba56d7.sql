-- ============================================
-- TABELA: notification_templates
-- ============================================
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  meta_template_name text NOT NULL,
  language_code text NOT NULL DEFAULT 'pt_PT',
  category text NOT NULL CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','paused','disabled')),
  body_text text NOT NULL,
  param_count int NOT NULL DEFAULT 0,
  param_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  meta_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TABELA: notification_optin
-- ============================================
CREATE TABLE public.notification_optin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  source text,
  ip_address text,
  user_agent text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);
CREATE INDEX idx_optin_profile_active ON public.notification_optin(profile_id)
  WHERE opted_in_at IS NOT NULL AND opted_out_at IS NULL;
CREATE INDEX idx_optin_phone ON public.notification_optin(phone_number);

-- ============================================
-- TABELA: notification_queue
-- ============================================
CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.notification_templates(id),
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  recipient_phone text NOT NULL,
  params jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_type text,
  context_id uuid,
  event_id uuid REFERENCES public.events(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','delivered','read','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  meta_message_id text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_queue_status_scheduled ON public.notification_queue(status, scheduled_at)
  WHERE status IN ('queued','sending');
CREATE INDEX idx_queue_meta_msg ON public.notification_queue(meta_message_id);
CREATE INDEX idx_queue_company ON public.notification_queue(company_id, created_at DESC);

-- ============================================
-- TABELA: notification_log
-- ============================================
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.notification_queue(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_log_queue ON public.notification_log(queue_id, created_at DESC);

-- ============================================
-- COLUNA whatsapp_phone em profiles
-- ============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_phone text;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_optin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read_all" ON public.notification_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "templates_write_admin" ON public.notification_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "optin_self_read" ON public.notification_optin
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "optin_self_write" ON public.notification_optin
  FOR ALL TO authenticated
  USING (profile_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (profile_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "queue_read_company" ON public.notification_queue
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()));

CREATE POLICY "log_read_company" ON public.notification_log
  FOR SELECT TO authenticated
  USING (queue_id IN (
    SELECT q.id FROM public.notification_queue q
    WHERE q.company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  ));

-- Service role grants (dispatcher e webhook)
GRANT SELECT, INSERT, UPDATE ON public.notification_templates TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_optin TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_queue TO service_role;
GRANT SELECT, INSERT ON public.notification_log TO service_role;

-- ============================================
-- SEED — 4 templates Grupo A (status pending)
-- ============================================
INSERT INTO public.notification_templates
  (template_name, meta_template_name, language_code, category, body_text, param_count, param_schema, description, status)
VALUES
(
  'equipe_atribuicao_evento',
  'equipe_atribuicao_evento',
  'pt_PT',
  'UTILITY',
  'Olá {{1}}, você foi atribuído como {{2}} do evento {{3}}. Fase atual: {{4}}. Acesse o sistema para detalhes.',
  4,
  '[
    {"position":1,"name":"user_name","description":"Nome do usuário"},
    {"position":2,"name":"role_label","description":"Diretor / Produtor Geral"},
    {"position":3,"name":"event_name","description":"Nome do evento"},
    {"position":4,"name":"phase_label","description":"SETUP/Planeamento/Montagem/Evento/Pós"}
  ]'::jsonb,
  'Disparado ao adicionar usuário em event_team_members',
  'pending'
),
(
  'lead_atribuido_zona_servico',
  'lead_atribuido_zona_servico',
  'pt_PT',
  'UTILITY',
  'Olá {{1}}, você é o responsável pela {{2}} {{3}} no evento {{4}}.',
  4,
  '[
    {"position":1,"name":"user_name","description":"Nome do usuário"},
    {"position":2,"name":"frente_type","description":"Zona/Serviço"},
    {"position":3,"name":"frente_name","description":"Nome da frente"},
    {"position":4,"name":"event_name","description":"Nome do evento"}
  ]'::jsonb,
  'Disparado ao definir current_lead_id em operacao_frentes',
  'pending'
),
(
  'etapa_status_alterado',
  'etapa_status_alterado',
  'pt_PT',
  'UTILITY',
  'Etapa {{1}} da {{2}} {{3}} mudou para: {{4}}.',
  4,
  '[
    {"position":1,"name":"etapa_name","description":"Nome da etapa"},
    {"position":2,"name":"frente_type","description":"Zona/Serviço"},
    {"position":3,"name":"frente_name","description":"Nome da frente"},
    {"position":4,"name":"new_status","description":"Novo status da etapa"}
  ]'::jsonb,
  'Disparado em UPDATE de operacao_etapas.status',
  'pending'
),
(
  'fase_evento_avancou',
  'fase_evento_avancou',
  'pt_PT',
  'UTILITY',
  'Evento {{1}} avançou para fase {{2}}. Verifique pendências.',
  2,
  '[
    {"position":1,"name":"event_name","description":"Nome do evento"},
    {"position":2,"name":"new_phase","description":"Nova fase (Planeamento/Montagem/Evento/Pós)"}
  ]'::jsonb,
  'Disparado em UPDATE de events.operacao_mode',
  'pending'
);

-- ============================================
-- HELPER RPC: enqueue_whatsapp_notification
-- ============================================
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_notification(
  p_template_name text,
  p_recipient_profile_id uuid,
  p_params jsonb,
  p_event_id uuid DEFAULT NULL,
  p_context_type text DEFAULT NULL,
  p_context_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
  v_phone text;
  v_company_id uuid;
  v_queue_id uuid;
  v_opted_in boolean;
BEGIN
  SELECT id INTO v_template_id
    FROM public.notification_templates
    WHERE template_name = p_template_name AND status = 'approved';
  IF v_template_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT no.phone_number,
         (no.opted_in_at IS NOT NULL AND no.opted_out_at IS NULL)
    INTO v_phone, v_opted_in
    FROM public.notification_optin no
    WHERE no.profile_id = p_recipient_profile_id;

  IF v_phone IS NULL OR NOT COALESCE(v_opted_in,false) THEN
    RETURN NULL;
  END IF;

  IF p_event_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id FROM public.events WHERE id = p_event_id;
  END IF;
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id
      FROM public.user_companies WHERE user_id = p_recipient_profile_id LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = p_recipient_profile_id;
  END IF;
  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_queue (
    template_id, recipient_profile_id, recipient_phone, params,
    context_type, context_id, event_id, company_id
  ) VALUES (
    v_template_id, p_recipient_profile_id, v_phone, p_params,
    p_context_type, p_context_id, p_event_id, v_company_id
  ) RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enqueue_whatsapp_notification(text, uuid, jsonb, uuid, text, uuid) TO authenticated, service_role;

-- ============================================
-- TRIGGERS (4)
-- ============================================

-- 1. Equipa adicionada a evento
CREATE OR REPLACE FUNCTION public.trg_notify_team_member_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_name text; v_event_name text; v_phase text; v_role_label text;
BEGIN
  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = NEW.profile_id;
  SELECT name, COALESCE(operacao_mode, 'SETUP') INTO v_event_name, v_phase
    FROM public.events WHERE id = NEW.event_id;
  v_role_label := CASE NEW.role
    WHEN 'director' THEN 'Diretor'
    WHEN 'general_producer' THEN 'Produtor Geral'
    ELSE NEW.role
  END;
  PERFORM public.enqueue_whatsapp_notification(
    'equipe_atribuicao_evento',
    NEW.profile_id,
    jsonb_build_array(
      COALESCE(v_user_name,''), v_role_label,
      COALESCE(v_event_name,''), COALESCE(v_phase,'SETUP')
    ),
    NEW.event_id, 'event', NEW.event_id
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_team_member_added ON public.event_team_members;
CREATE TRIGGER notify_team_member_added
  AFTER INSERT ON public.event_team_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_team_member_added();

-- 2. Lead atribuído a Zona/Serviço
CREATE OR REPLACE FUNCTION public.trg_notify_lead_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_name text; v_event_name text; v_frente_type text;
BEGIN
  IF NEW.current_lead_id IS DISTINCT FROM OLD.current_lead_id
     AND NEW.current_lead_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name FROM public.profiles WHERE id = NEW.current_lead_id;
    SELECT name INTO v_event_name FROM public.events WHERE id = NEW.event_id;
    v_frente_type := CASE NEW.type
      WHEN 'zone' THEN 'Zona'
      WHEN 'service' THEN 'Serviço'
      ELSE 'Frente'
    END;
    PERFORM public.enqueue_whatsapp_notification(
      'lead_atribuido_zona_servico',
      NEW.current_lead_id,
      jsonb_build_array(
        COALESCE(v_user_name,''), v_frente_type,
        COALESCE(NEW.name,''), COALESCE(v_event_name,'')
      ),
      NEW.event_id, 'frente', NEW.id
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_lead_assigned ON public.operacao_frentes;
CREATE TRIGGER notify_lead_assigned
  AFTER UPDATE OF current_lead_id ON public.operacao_frentes
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_lead_assigned();

-- 3. Status de etapa alterado
CREATE OR REPLACE FUNCTION public.trg_notify_etapa_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_frente_name text; v_frente_type text; v_lead_id uuid; v_event_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT f.name, f.type, f.current_lead_id, f.event_id
      INTO v_frente_name, v_frente_type, v_lead_id, v_event_id
      FROM public.operacao_frentes f WHERE f.id = NEW.frente_id;
    IF v_lead_id IS NOT NULL THEN
      PERFORM public.enqueue_whatsapp_notification(
        'etapa_status_alterado',
        v_lead_id,
        jsonb_build_array(
          COALESCE(NEW.name,''),
          CASE v_frente_type WHEN 'zone' THEN 'Zona' WHEN 'service' THEN 'Serviço' ELSE 'Frente' END,
          COALESCE(v_frente_name,''),
          COALESCE(NEW.status,'')
        ),
        v_event_id, 'etapa', NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_etapa_status_changed ON public.operacao_etapas;
CREATE TRIGGER notify_etapa_status_changed
  AFTER UPDATE OF status ON public.operacao_etapas
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_etapa_status_changed();

-- 4. Fase do evento avançou
CREATE OR REPLACE FUNCTION public.trg_notify_event_phase_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient uuid;
  v_phase_label text;
BEGIN
  IF NEW.operacao_mode IS DISTINCT FROM OLD.operacao_mode THEN
    v_phase_label := CASE NEW.operacao_mode
      WHEN 'planning' THEN 'Planeamento'
      WHEN 'montagem' THEN 'Montagem'
      WHEN 'evento'   THEN 'Evento'
      WHEN 'post'     THEN 'Pós-Evento'
      ELSE COALESCE(NEW.operacao_mode, 'SETUP')
    END;

    FOR v_recipient IN
      SELECT DISTINCT profile_id FROM public.event_team_members
      WHERE event_id = NEW.id AND role IN ('director','general_producer')
    LOOP
      PERFORM public.enqueue_whatsapp_notification(
        'fase_evento_avancou', v_recipient,
        jsonb_build_array(COALESCE(NEW.name,''), v_phase_label),
        NEW.id, 'event', NEW.id
      );
    END LOOP;

    FOR v_recipient IN
      SELECT DISTINCT current_lead_id FROM public.operacao_frentes
      WHERE event_id = NEW.id AND current_lead_id IS NOT NULL
        AND current_lead_id NOT IN (
          SELECT profile_id FROM public.event_team_members
          WHERE event_id = NEW.id AND role IN ('director','general_producer')
        )
    LOOP
      PERFORM public.enqueue_whatsapp_notification(
        'fase_evento_avancou', v_recipient,
        jsonb_build_array(COALESCE(NEW.name,''), v_phase_label),
        NEW.id, 'event', NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_event_phase_changed ON public.events;
CREATE TRIGGER notify_event_phase_changed
  AFTER UPDATE OF operacao_mode ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_event_phase_changed();