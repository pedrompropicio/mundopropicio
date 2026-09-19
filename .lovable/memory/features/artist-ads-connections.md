---
name: Contas de tráfego por artista (D-ERP57)
description: Ligações Meta/Google/TikTok Ads das contas do próprio artista em crm.ad_platform_connections com connection_scope='artist'
type: feature
---

A Social Music gere campanhas nas contas de anúncios DO ARTISTA. Isso vive em
`crm.ad_platform_connections` com `connection_scope = 'artist'` + `artist_id`; a linha
pertence sempre à empresa gestora (`company_id` é a fronteira de acesso das policies).

- Não confundir com captação de dados (`artist_channel_connections`, D-ERP39, só leitura).
- Meta: `artist-ads-meta-oauth-start` (JWT, papéis admin/platform_admin/manager/
  marketing_manager) devolve `authorize_url` para o artista abrir →
  `artist-ads-meta-oauth-callback` (público, `state` com TTL 24h em `crm.oauth_states`,
  que ganhou `artist_id` + `return_url`) → `crm.upsert_artist_meta_connection`
  (token cifrado, `available_ad_accounts`). Mesmo app e scopes das ligações Meta do CRM.
- Uma conta → nasce `active`; várias → `pending_selection` até
  `artist-ads-select-account`. `artist-ads-disconnect` → `revoked` + apaga token.
- Google/TikTok sem OAuth: RPC `artist_ads_register_external(artist, platform,
  external_id, name)` grava `pending_link`. O Google fica `active` quando
  `crm-google-sync-campaigns` (lê `active` + `pending_link`, usa
  `selected_ad_account_id` ou `external_business_id`) alcança a conta sob o MCC.
- Unicidade: caiu `UNIQUE(company_id, platform)`; há dois índices parciais
  (`artist_id IS NULL` vs `(company_id, artist_id, platform)`). Qualquer `ON CONFLICT`
  nesta tabela tem de indicar o predicado.
- Primeiro caso real: Litto Lins, Google Ads `8841388615`, empresa Social Artists.

## Sync das campanhas e auto-ligação (D-ERP90, 19/09/2026)

As campanhas entram por cron, não por visita ao ecrã (antes só gravavam quando
alguém abria o MP Audience e a connection do Litto tinha 0 linhas):

- job 241 `crm-meta-campaigns-hourly`, `25 * * * *` — uma chamada de
  `crm-meta-sync-campaigns` por connection meta `active` com
  `selected_ad_account_id`, `mode: incremental`. Minuto 25 para correr antes dos
  insights do job 93 (minuto 40).
- job 242 `crm-google-sync-campaigns-3h`, `10 */3 * * *` — uma chamada de
  `crm-google-sync-campaigns` sem `connection_id`, `mode: incremental`,
  `days_back: 7`. De 3 em 3 horas: 2 consultas GAQL por conta e métricas que
  consolidam com atraso.

Ambos no padrão do job 93 (vault `email_queue_service_role_key` + `net.http_post`).
Crons não propagam Test→Live via Publish.

**Regra: connection de artista liga campanhas a MÚSICAS, nunca a eventos.**
No fim do sync, `connection_scope='company'` chama
`crm_auto_link_*_campaigns_to_events` (inalterado); `connection_scope='artist'`
salta esse auto-link e chama `public.artist_ads_autolink_songs_internal(artist_id)`
(best-effort; devolve `songs_linked_count` na Meta e `songs_linked` no Google).

Funções SQL (a regra de correspondência vive uma vez):
- `crm.artist_ads_autolink_songs_core(artist, company)` — o núcleo: título-base
  normalizado com ≥ 8 caracteres contido no nome normalizado da campanha, só
  `linked_song_id IS NULL`, desempate por título mais longo e depois música mais
  antiga, só connections `connection_scope='artist'` desse artista. EXECUTE
  revogado a PUBLIC.
- `public.artist_ads_autolink_songs(artist)` — para o utilizador, assinatura
  inalterada: `artist_ads_assert_access` + núcleo.
- `public.artist_ads_autolink_songs_internal(artist)` — SECURITY DEFINER para
  cron: resolve a empresa pelo artista e chama o núcleo. anon false,
  authenticated false, service_role true.
