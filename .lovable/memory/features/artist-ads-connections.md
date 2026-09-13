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
