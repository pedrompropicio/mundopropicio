-- Revisão: https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6387254548
-- Original SHA256: c1c1d3022a8d8de51368fcdfbc58e82407568ad5377f1389bf05fb25612c1b4e
-- retirar apenas INSERT operacional ugc_watchdog_config; preservar DDL, templates e controlos de segurança
CREATE TABLE public.ugc_watchdog_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  label text NOT NULL,
  recipient_phone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ugc_watchdog_config TO authenticated;
GRANT ALL ON public.ugc_watchdog_config TO service_role;

ALTER TABLE public.ugc_watchdog_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY ugc_watchdog_config_read ON public.ugc_watchdog_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY ugc_watchdog_config_write ON public.ugc_watchdog_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.ugc_watchdog_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  check_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','missing_alerted','still_missing_alerted')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, check_date, status)
);

GRANT SELECT ON public.ugc_watchdog_log TO authenticated;
GRANT ALL ON public.ugc_watchdog_log TO service_role;

ALTER TABLE public.ugc_watchdog_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ugc_watchdog_log_read ON public.ugc_watchdog_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

INSERT INTO public.notification_templates
  (template_name, meta_template_name, language_code, category, status, body_text, param_count, description)
VALUES
  ('ugc_leitura_em_falta', 'ugc_leitura_em_falta', 'pt_PT', 'UTILITY', 'pending',
   'Falta a leitura do UGC TikTok do {{1}} de hoje. Faz o atalho no telemóvel. Última leitura: {{2}}.',
   2, 'Watchdog diário da leitura UGC TikTok do atalho iOS');
