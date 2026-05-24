-- Template: chamado_ocorrencia (TESTE: aponta para hello_world/en_US até template real ser aprovado pela Meta)
INSERT INTO public.notification_templates (template_name, meta_template_name, language_code, category, status, param_count, body_text)
VALUES (
  'chamado_ocorrencia',
  'hello_world',           -- TEMP: substituir pelo template real após aprovação Meta
  'en_US',                 -- TEMP: idioma do hello_world
  'UTILITY',
  'approved',
  0,
  'Novo chamado de ocorrência aberto.'
)
ON CONFLICT (template_name) DO UPDATE SET
  meta_template_name = EXCLUDED.meta_template_name,
  language_code = EXCLUDED.language_code,
  status = EXCLUDED.status,
  param_count = EXCLUDED.param_count,
  body_text = EXCLUDED.body_text,
  updated_at = now();

-- Trigger function: notifica super admin quando é aberto um chamado na Coala 2026
CREATE OR REPLACE FUNCTION public.notify_chamado_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_target_event uuid := '5a1da5fb-3115-4ae3-af50-15ce1f869a5c'; -- Coala Festival Portugal 2026
  v_super_admin uuid := 'd8e502f7-9ceb-4dae-bd73-7291832d0d6f';  -- Pedro Neto
BEGIN
  IF NEW.kind <> 'chamado' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT event_id INTO v_event_id
      FROM public.operacao_frentes
      WHERE id = NEW.frente_id;

    IF v_event_id = v_target_event THEN
      PERFORM public.enqueue_whatsapp_notification(
        'chamado_ocorrencia',
        v_super_admin,
        '{}'::jsonb,
        v_event_id,
        'operacao_registro',
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Notificação é secundária: nunca rebenta o INSERT do registo
    RAISE WARNING 'notify_chamado_aberto failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_chamado_aberto ON public.operacao_registros;
CREATE TRIGGER notify_chamado_aberto
AFTER INSERT ON public.operacao_registros
FOR EACH ROW
EXECUTE FUNCTION public.notify_chamado_aberto();