-- ============================================
-- SISTEMA GENÉRICO DE LEMBRETES DA PLATAFORMA
-- ============================================

-- Configuração global (1 linha)
CREATE TABLE IF NOT EXISTS public.system_reminder_settings (
  id INT PRIMARY KEY DEFAULT 1,
  default_whatsapp_recipient TEXT,
  default_twilio_from TEXT DEFAULT '+14155238886',
  daily_send_hour_lisbon INT NOT NULL DEFAULT 9,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.system_reminder_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.system_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin manage settings" ON public.system_reminder_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Lembretes
CREATE TABLE IF NOT EXISTS public.system_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_date DATE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('once','daily','weekly')),
  whatsapp_recipient TEXT,
  twilio_from TEXT,
  link_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  send_count INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_reminders_due
  ON public.system_reminders (due_date) WHERE completed_at IS NULL AND is_active = true;

ALTER TABLE public.system_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read reminders" ON public.system_reminders
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins manage reminders" ON public.system_reminders
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_system_reminders_updated
  BEFORE UPDATE ON public.system_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_system_reminder_settings_updated
  BEFORE UPDATE ON public.system_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: lembrete Batch 9 (NOT NULL company_id) - 6 Maio 2026
INSERT INTO public.system_reminders (key, title, message, due_date, frequency, link_url)
VALUES (
  'multi_tenant_batch_9_not_null',
  'Aplicar Batch 9 — NOT NULL company_id',
  'Já passou o período de monitorização D+7 da migração multi-tenant. Está na hora de correr o script *11-BATCH-9-not-null-D7.txt* no SQL Editor de Live para aplicar as constraints NOT NULL nas 70 tabelas com company_id. Após executar, marca este lembrete como concluído em /admin/lembretes.',
  '2026-05-06',
  'daily',
  '/admin/lembretes'
) ON CONFLICT (key) DO NOTHING;