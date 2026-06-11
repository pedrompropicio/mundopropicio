# Portal público — Tracking, Consentimento e Cupões

Integrações de marketing do portal público (mundopropicio.com, projeto Lovable `26b95793`) e a sua configuração no admin do ERP (projeto `ab7cf7e3`, MP CRM → Portal Settings → Tracking & Marketing).

Base de dados partilhada (Supabase Live `sfohvvlqccmmebvjgibx`). O admin define chaves em `public.portal_settings`; o portal lê-as via a view `portal_settings_public`. As chaves novas NÃO são criadas ao guardar no admin — exigem seed manual em Live (INSERT). O campo aparece automaticamente no admin (Portal Settings é data-driven) assim que a row existir.

## Chaves (portal_settings, categoria `tracking`)
- `general.site_pixel_id` — Meta Pixel de marca, global ao site
- `general.gtm_container_id` — ID do container Google Tag Manager (GTM-XXXXXXX)
- `general.vip_coupon_code` — código do cupão VIP global (fallback)
- `general.vip_coupon_discount_label` — texto do desconto global
- `general.vip_coupon_valid_until` — validade do cupão global

Tudo degrada a zero quando vazio: sem pixel, sem GTM, sem cupão — o portal não muda nada visível.

## Meta Pixel (marca + por-evento)
- Global: `general.site_pixel_id` injeta o Pixel em todo o site, condicionado ao consentimento de marketing.
- Por-evento: `events.meta_pixel_id` tem precedência — numa página de evento com pixel próprio, o global não dispara (evita PageView duplicado), via mecanismo de "claim".
- Ficheiros portal: `SitePixel.tsx`, `useEventPixel.ts`, `sitePixelClaim.ts`, `metaPixel.ts`.

## Cupão VIP
- Por-evento: `events.vip_coupon_code`, `vip_coupon_discount_label`, `vip_coupon_valid_until` (editor de eventos, tab Gestão).
- Global (fallback): `general.vip_coupon_*`.
- Resolução: o evento tem prioridade; se vazio, usa o global.
- Exibição (página de evento): só aparece se houver código não-vazio E validade futura (ou sem validade); caso contrário mantém-se só o "acesso antecipado". Bilingue.
- Ficheiro portal: `EventPage.tsx`.

## Google Tag Manager + Consent Mode v2
- `general.gtm_container_id` injeta o container GTM em todo o site (`SiteGtm.tsx`, `gtm.ts`).
- Consent Mode v2: arranca tudo `denied` antes de qualquer tag; atualiza conforme o banner (`consent.tsx`): `analytics` → `analytics_storage`; `marketing` → `ad_storage`/`ad_user_data`/`ad_personalization`.
- Eventos de conversão no dataLayer: `vip_lead` (submissão de lead — `EventLeadForm.tsx`, `VipSignupModal.tsx`) e `ticket_click` (botões de bilheteira — `EventPage.tsx`). O GTM usa-os para disparar conversões de GA4/Google Ads.
- O GA4 e o Google Ads ligam-se DENTRO do GTM, sem mexer no código. Coexiste com o Meta (independentes).
- Atribuição: o portal capta UTMs (`leadContext.ts`). A captura de `gclid` e gravação no CRM (edge function de servidor `crm-google-click-ingest`) ainda NÃO está ligada no portal.
