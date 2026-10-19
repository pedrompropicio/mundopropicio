# Proposta — Watchdog UGC iOS (alerta WhatsApp diário)

Pedido do quadro (chat 6 → chat 2, 19/10/2026). **Estado: ATIVO desde 19/10/2026** — template aprovado, envio de teste `sent` (22:2x UTC), crons 14:00/20:00 UTC criados em Live. Destinatário com `recipient_profile_id` + `company_id` em `ugc_watchdog_config` (migration 0208).

## Desenho

1. **Edge function `ugc-ios-reading-watchdog`** (nova, `verify_jwt=false` com segredo de cron, padrão whatsapp-dispatcher):
   - Para cada música em `ugc_watchdog_config` (ativa), verifica se existe leitura de **hoje (data de Lisboa)** em `artist_song_metrics_daily` com `source='ios_shortcut'`, `platform='tiktok'`, `metric='ugc_videos'`.
   - Modo `dry_run` (default true): só devolve o que faria, sem escrever log nem enviar.
   - Janela 14:00 UTC → se em falta e ainda não alertado hoje: enfileira em `notification_queue`, grava `missing_alerted`.
   - Janela 20:00 UTC → se continuar em falta e só houve 1.º aviso: enfileira de novo, grava `still_missing_alerted`. Máx. 2 avisos/dia/música.
   - Se a leitura existir: grava `ok` (uma linha/dia/música) e não envia nada.
   - Texto (pt-PT): `Falta a leitura do UGC TikTok do Litto de hoje. Faz o atalho no telemóvel. Última leitura: {data} = {valor}.` — data/valor vêm da última leitura existente (podem ser "—" se nunca houve).
   - Envio via `notification_queue` + `whatsapp-dispatcher` existente (não reinventa envio nem retry).

2. **Tabela `ugc_watchdog_log`**: `song_id`, `check_date` (data Lisboa), `status` (`ok`/`missing_alerted`/`still_missing_alerted`), `sent_at`. UNIQUE(song_id, check_date, status) → garante no máximo 1 aviso por música por janela.

3. **Tabela `ugc_watchdog_config`** (editável, sem número fixo no código): `song_id`, `label` (ex.: "Litto"), `recipient_phone` (E.164, seed: +351914001573), `active`. O número do Pedro fica **só** nesta tabela.

4. **pg_cron** (2 jobs, aplicados em Live via SQL Editor — crons não propagam com Publish):
   - `ugc_watchdog_1400` — `0 14 * * *`
   - `ugc_watchdog_2000` — `0 20 * * *`

5. **Template Meta**: a janela de 24 h estará quase sempre fechada (alerta é iniciativa do sistema), logo **é preciso template aprovado**.
   - Verificado em 19/10: `notification_templates` tem 6 templates; os aprovados (`chamado_ocorrencia`→hello_world, `fase_evento_avancou`→hello_world, `subscricao_confirmada`) **não servem**.
   - Registar na Meta: nome `ugc_leitura_em_falta`, categoria **UTILITY**, idioma **pt_PT**, corpo:
     `Alerta da sua conta Mundo Propício: a leitura diária do UGC TikTok do {{1}} está pendente. Última leitura registada: {{2}} vídeos.`
     (texto final aprovado pela Meta em 19/10; WABA 1454120833108603, phone_number_id 1183687074822342)
     (2 variáveis; exemplo para a revisão: `{{1}}`="Litto", `{{2}}`="18/10 = 16.800").
   - Estado: **approved** em `notification_templates`.
   - (Histórico) Enquanto não estava aprovado, o dispatcher falha o envio (template pendente) — o watchdog continua a registar `missing_alerted` no log.

6. **Não toca** no atalho iOS nem em leituras existentes. Só lê `artist_song_metrics_daily`.

## DDL exato (migration, a aplicar só após OK)

```sql
-- ugc_ios_watchdog: tabela de configuração + log diário do alerta WhatsApp

CREATE TABLE public.ugc_watchdog_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  label text NOT NULL,
  recipient_phone text NOT NULL,           -- E.164, ex.: +351914001573
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
  check_date date NOT NULL,                -- data em Europe/Lisbon
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

-- Template no catálogo interno (status pending até a Meta aprovar)
INSERT INTO public.notification_templates
  (template_name, meta_template_name, language_code, category, status, body_text, param_count, description)
VALUES
  ('ugc_leitura_em_falta', 'ugc_leitura_em_falta', 'pt_PT', 'UTILITY', 'pending',
   'Falta a leitura do UGC TikTok do {{1}} de hoje. Faz o atalho no telemóvel. Última leitura: {{2}}.',
   2, 'Watchdog diário da leitura UGC TikTok do atalho iOS');

-- Seed da configuração (número editável depois na tabela, não no código)
INSERT INTO public.ugc_watchdog_config (song_id, label, recipient_phone)
VALUES ('74c40d7b-357b-4311-acbe-eb9bfa7ba7c7', 'Litto', '+351914001573');
```

## Cron (SQL Editor em Live, só após OK)

```sql
SELECT cron.schedule('ugc_watchdog_1400', '0 14 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/ugc-ios-reading-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
    body := '{"dry_run": false}'::jsonb);
$cmd$);

SELECT cron.schedule('ugc_watchdog_2000', '0 20 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/ugc-ios-reading-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
    body := '{"dry_run": false}'::jsonb);
$cmd$);
```

## Código proposto (edge function, resumo)

`supabase/functions/ugc-ios-reading-watchdog/index.ts`:
- Auth: exige `Authorization: Bearer <service_role>` (igual ao padrão do dispatcher).
- Body `{ dry_run?: boolean }` (default `true`).
- `const today = (new Date()).toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })`.
- Lê `ugc_watchdog_config WHERE active`; para cada linha:
  - `SELECT value FROM artist_song_metrics_daily WHERE song_id=? AND platform='tiktok' AND metric='ugc_videos' AND source='ios_shortcut' AND date=?` (hoje Lisboa).
  - Última leitura: mesma query sem filtro de data, `ORDER BY date DESC LIMIT 1`.
  - Se existe hoje → log `ok` (insert on conflict do nothing).
  - Se falta → conta logs do dia; 0 → enqueue + `missing_alerted`; 1 → enqueue + `still_missing_alerted`; 2 → nada.
  - Enqueue: insert em `notification_queue` com `template_name='ugc_leitura_em_falta'`, `to_phone=config.recipient_phone`, `payload={1: label, 2: "DD/MM = valor"}`.
- Em `dry_run`: devolve JSON com as decisões sem escrever nada.

## Sequência após OK do Pedro

1. Aplicar migration (canal oficial) → 2. Submeter template `ugc_leitura_em_falta` na Meta → 3. Deploy da edge function (0 · Cowork) → 4. `dry_run` → 5. Envio de teste real → 6. Criar os 2 crons em Live.
