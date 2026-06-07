CREATE OR REPLACE FUNCTION public.tg_lead_capture_vip_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  MP_COMPANY_ID constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  PORTAL_URL_BASE constant text := 'https://www.mundopropicio.com';
  FROM_LINE constant text := 'Mundo Propício <noreply@mpgestaoeventos.com>';
  SENDER_DOM constant text := 'notify.mpgestaoeventos.com';
  v_locale text;
  v_lang text;
  v_coupon text;
  v_email_lc text;
  v_event_name text;
  v_event_url text;
  v_unsub_token text;
  v_unsub_url text;
  v_unsub_label text;
  v_subject text;
  v_greeting text;
  v_html text;
  v_text text;
  v_message_id text;
  v_idem_key text;
  v_payload jsonb;
BEGIN
  -- Guarda: só dispara para opt-in com email
  IF NEW.email IS NULL OR NEW.email = '' OR NEW.consent_email IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Wrapper best-effort: qualquer falha do caminho do email NUNCA aborta o
  -- INSERT em lead_capture. RAISE NOTICE para Postgres logs.
  BEGIN
  -- Locale: 'en' se NEW.raw->>'locale' = 'en', caso contrário 'pt'
  v_locale := lower(coalesce(NEW.raw->>'locale', ''));
  v_lang := CASE WHEN v_locale = 'en' THEN 'en' ELSE 'pt' END;

  -- Código de cupão (jsonb → text, sem aspas; NULL se vazio/ausente)
  SELECT NULLIF(btrim(value #>> '{}'), '')
    INTO v_coupon
  FROM public.portal_settings
  WHERE company_id = MP_COMPANY_ID
    AND key = 'general.vip_coupon_code'
  LIMIT 1;

  -- Nome do evento (opcional, se event_slug presente)
  v_event_name := NULL;
  v_event_url := PORTAL_URL_BASE || '/eventos';
  IF NEW.event_slug IS NOT NULL AND NEW.event_slug <> '' THEN
    SELECT COALESCE(e.title_pt, e.title_en, e.name)
      INTO v_event_name
    FROM public.events e
    WHERE e.company_id = MP_COMPANY_ID AND e.slug = NEW.event_slug
    LIMIT 1;
    v_event_url := PORTAL_URL_BASE || '/eventos/' || NEW.event_slug;
  END IF;

  -- ── Unsubscribe (RGPD) ──
  v_email_lc := lower(NEW.email);
  SELECT token INTO v_unsub_token
    FROM public.email_unsubscribe_tokens
   WHERE email = v_email_lc
   LIMIT 1;
  IF v_unsub_token IS NULL THEN
    v_unsub_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.email_unsubscribe_tokens (token, email, company_id)
      VALUES (v_unsub_token, v_email_lc, MP_COMPANY_ID)
    ON CONFLICT (email) DO NOTHING;
    SELECT token INTO v_unsub_token
      FROM public.email_unsubscribe_tokens
     WHERE email = v_email_lc
     LIMIT 1;
  END IF;
  v_unsub_url := PORTAL_URL_BASE || '/unsubscribe?token=' || v_unsub_token;
  v_unsub_label := CASE WHEN v_lang = 'en' THEN 'Unsubscribe' ELSE 'Cancelar subscrição' END;

  v_message_id := 'vip-welcome:' || NEW.id::text;
  v_idem_key := v_message_id;

  -- ── Conteúdo localizado ──
  IF v_lang = 'en' THEN
    v_greeting := CASE WHEN NEW.name IS NOT NULL AND btrim(NEW.name) <> ''
                       THEN 'Hi ' || NEW.name || ','
                       ELSE 'Hi,' END;

    IF v_coupon IS NOT NULL THEN
      v_subject := 'Welcome to VIP — your 5% off code';
    ELSE
      v_subject := 'Welcome to VIP — you''re in';
    END IF;

    v_text :=
      v_greeting || E'\n\n' ||
      'Welcome to Mundo Propício VIP.' || E'\n\n' ||
      CASE WHEN v_event_name IS NOT NULL
           THEN 'Thanks for showing interest in ' || v_event_name || '. ' ELSE '' END ||
      'You now get 5% off across all events on sale.' || E'\n\n' ||
      CASE WHEN v_coupon IS NOT NULL THEN
        'Your VIP code: ' || v_coupon || E'\n' ||
        'Use it at checkout on the ticketing site to redeem your 5% off.' || E'\n\n'
      ELSE
        'Your VIP code is on its way — we''ll email it shortly.' || E'\n\n'
      END ||
      'Browse events: ' || v_event_url || E'\n\n' ||
      'See you there.' || E'\n— Mundo Propício' || E'\n\n' ||
      '— —' || E'\n' ||
      'You received this because you opted in as VIP at mundopropicio.com.' || E'\n' ||
      'Unsubscribe at any time: ' || v_unsub_url;

    v_html :=
      '<div style="font-family:Helvetica,Arial,sans-serif;background:#0a0a0a;padding:32px 0;color:#e9e6dc">' ||
        '<div style="max-width:560px;margin:0 auto;padding:0 24px">' ||
          '<div style="text-align:center;margin-bottom:24px"><span style="font-size:14px;letter-spacing:.3em;color:#d4af37;text-transform:uppercase">Mundo Propício · VIP</span></div>' ||
          '<h1 style="font-size:22px;font-weight:600;color:#f5f2e8;margin:0 0 16px 0">' || v_greeting || '</h1>' ||
          '<p style="font-size:15px;line-height:1.6;margin:0 0 16px 0">Welcome to <strong style="color:#d4af37">Mundo Propício VIP</strong>.</p>' ||
          CASE WHEN v_event_name IS NOT NULL
               THEN '<p style="font-size:15px;line-height:1.6;margin:0 0 16px 0">Thanks for showing interest in <em>' || v_event_name || '</em>.</p>'
               ELSE '' END ||
          '<p style="font-size:15px;line-height:1.6;margin:0 0 20px 0">You now get <strong>5% off</strong> across all events on sale.</p>' ||
          CASE WHEN v_coupon IS NOT NULL THEN
            '<div style="background:linear-gradient(135deg,#1a1a1a,#2a2410);border:1px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:24px 0">' ||
              '<div style="font-size:11px;letter-spacing:.3em;color:#d4af37;text-transform:uppercase;margin-bottom:8px">Your VIP code</div>' ||
              '<div style="font-size:26px;font-weight:700;color:#f5f2e8;letter-spacing:.15em;font-family:Menlo,Consolas,monospace">' || v_coupon || '</div>' ||
              '<div style="font-size:12px;color:#a39e8e;margin-top:10px">Use it at checkout on the ticketing site.</div>' ||
            '</div>'
          ELSE
            '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px;text-align:center;margin:24px 0;font-size:13px;color:#a39e8e">Your VIP code is on its way — we''ll email it shortly.</div>'
          END ||
          '<div style="text-align:center;margin:28px 0 8px 0">' ||
            '<a href="' || v_event_url || '" style="display:inline-block;background:#d4af37;color:#0a0a0a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:.05em">Browse events</a>' ||
          '</div>' ||
          '<p style="font-size:12px;color:#7c7669;text-align:center;margin-top:32px;line-height:1.5">See you there.<br/>— Mundo Propício</p>' ||
          '<p style="font-size:11px;color:#5a564c;text-align:center;margin-top:24px;line-height:1.6;border-top:1px solid #1f1d18;padding-top:16px">' ||
            'You received this because you opted in as VIP at <a href="' || PORTAL_URL_BASE || '" style="color:#7c7669;text-decoration:underline">mundopropicio.com</a>.<br/>' ||
            '<a href="' || v_unsub_url || '" style="color:#d4af37;text-decoration:underline">' || v_unsub_label || '</a>' ||
          '</p>' ||
        '</div>' ||
      '</div>';

  ELSE
    -- PT (default)
    v_greeting := CASE WHEN NEW.name IS NOT NULL AND btrim(NEW.name) <> ''
                       THEN 'Olá ' || NEW.name || ','
                       ELSE 'Olá,' END;

    IF v_coupon IS NOT NULL THEN
      v_subject := 'Bem-vindo ao VIP — o teu código de 5%';
    ELSE
      v_subject := 'Bem-vindo ao VIP';
    END IF;

    v_text :=
      v_greeting || E'\n\n' ||
      'Bem-vindo ao Mundo Propício VIP.' || E'\n\n' ||
      CASE WHEN v_event_name IS NOT NULL
           THEN 'Obrigado pelo interesse em ' || v_event_name || '. ' ELSE '' END ||
      'A partir de agora tens 5% de desconto em todos os eventos à venda.' || E'\n\n' ||
      CASE WHEN v_coupon IS NOT NULL THEN
        'O teu código VIP: ' || v_coupon || E'\n' ||
        'Aplica-o no checkout da bilheteira para obter os 5%.' || E'\n\n'
      ELSE
        'O teu código VIP está a caminho — enviamos por email em breve.' || E'\n\n'
      END ||
      'Ver eventos: ' || v_event_url || E'\n\n' ||
      'Até já.' || E'\n— Mundo Propício' || E'\n\n' ||
      '— —' || E'\n' ||
      'Recebeste este email porque te inscreveste como VIP em mundopropicio.com.' || E'\n' ||
      'Cancela quando quiseres: ' || v_unsub_url;

    v_html :=
      '<div style="font-family:Helvetica,Arial,sans-serif;background:#0a0a0a;padding:32px 0;color:#e9e6dc">' ||
        '<div style="max-width:560px;margin:0 auto;padding:0 24px">' ||
          '<div style="text-align:center;margin-bottom:24px"><span style="font-size:14px;letter-spacing:.3em;color:#d4af37;text-transform:uppercase">Mundo Propício · VIP</span></div>' ||
          '<h1 style="font-size:22px;font-weight:600;color:#f5f2e8;margin:0 0 16px 0">' || v_greeting || '</h1>' ||
          '<p style="font-size:15px;line-height:1.6;margin:0 0 16px 0">Bem-vindo ao <strong style="color:#d4af37">Mundo Propício VIP</strong>.</p>' ||
          CASE WHEN v_event_name IS NOT NULL
               THEN '<p style="font-size:15px;line-height:1.6;margin:0 0 16px 0">Obrigado pelo interesse em <em>' || v_event_name || '</em>.</p>'
               ELSE '' END ||
          '<p style="font-size:15px;line-height:1.6;margin:0 0 20px 0">A partir de agora tens <strong>5% de desconto</strong> em todos os eventos à venda.</p>' ||
          CASE WHEN v_coupon IS NOT NULL THEN
            '<div style="background:linear-gradient(135deg,#1a1a1a,#2a2410);border:1px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:24px 0">' ||
              '<div style="font-size:11px;letter-spacing:.3em;color:#d4af37;text-transform:uppercase;margin-bottom:8px">O teu código VIP</div>' ||
              '<div style="font-size:26px;font-weight:700;color:#f5f2e8;letter-spacing:.15em;font-family:Menlo,Consolas,monospace">' || v_coupon || '</div>' ||
              '<div style="font-size:12px;color:#a39e8e;margin-top:10px">Aplica-o no checkout da bilheteira.</div>' ||
            '</div>'
          ELSE
            '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px;text-align:center;margin:24px 0;font-size:13px;color:#a39e8e">O teu código VIP está a caminho — enviamos por email em breve.</div>'
          END ||
          '<div style="text-align:center;margin:28px 0 8px 0">' ||
            '<a href="' || v_event_url || '" style="display:inline-block;background:#d4af37;color:#0a0a0a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:.05em">Ver eventos</a>' ||
          '</div>' ||
          '<p style="font-size:12px;color:#7c7669;text-align:center;margin-top:32px;line-height:1.5">Até já.<br/>— Mundo Propício</p>' ||
          '<p style="font-size:11px;color:#5a564c;text-align:center;margin-top:24px;line-height:1.6;border-top:1px solid #1f1d18;padding-top:16px">' ||
            'Recebeste este email porque te inscreveste como VIP em <a href="' || PORTAL_URL_BASE || '" style="color:#7c7669;text-decoration:underline">mundopropicio.com</a>.<br/>' ||
            '<a href="' || v_unsub_url || '" style="color:#d4af37;text-decoration:underline">' || v_unsub_label || '</a>' ||
          '</p>' ||
        '</div>' ||
      '</div>';
  END IF;

  -- ── Payload no schema EXATO que process-email-queue espera ──
  v_payload := jsonb_build_object(
    'message_id',       v_message_id,
    'to',               NEW.email,
    'from',             FROM_LINE,
    'sender_domain',    SENDER_DOM,
    'subject',          v_subject,
    'html',             v_html,
    'text',             v_text,
    'purpose',          'transactional',
    'label',            'portal_vip_welcome',
    'idempotency_key',  v_idem_key,
    'unsubscribe_token', v_unsub_token,
    'queued_at',        to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  PERFORM public.enqueue_email('transactional_emails', v_payload);

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'tg_lead_capture_vip_welcome falhou para lead %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;