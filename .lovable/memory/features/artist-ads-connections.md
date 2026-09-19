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

## Nível anúncio e moeda da conta (D-ERP91, 19/09/2026)

- Cron job 241 (`25 * * * *`) sincroniza, por connection meta `active` com conta escolhida,
  campanhas + conjuntos + anúncios (`crm-meta-sync-campaigns`, `-adsets`, `-ads`,
  `mode: incremental`); job 93 (`40 * * * *`) pede insights nos níveis `campaign`,
  `adset` e `ad`. Cobrem scope `company` e `artist`.
- `crm-meta-sync-ads` guarda o criativo expandido em `raw.creative`
  (`id,name,thumbnail_url,image_url,video_id,effective_object_story_id,
  effective_instagram_media_id,instagram_permalink_url,object_type`) — sem colunas
  novas. `thumbnail_url` da Meta EXPIRA; é refrescado a cada sync.
  `crm.meta_creatives` é a biblioteca do MP Audience e não serve para isto.
- Moeda: `crm-google-sync-campaigns` grava `customer.currency_code` em
  `selected_ad_account_currency` quando está NULL ou diferente; nunca se assume
  BRL/EUR. `artist_ads_campaigns` (ramo Google) usa
  `coalesce(selected_ad_account_currency, moeda mais recente de
  google_campaign_insights_daily)`.
- `public.artist_ads_ads(p_artist_id, p_campaign_id default null)` — uma linha por
  anúncio **Meta**, métricas a 7 d e 30 d (spend, impressions, clicks, ctr, cpc,
  video_3s_views, thruplays, cost_per_thruplay; divisão por zero → NULL),
  `linked_song_id` herdado da campanha, `permalink` do Instagram ou derivado de
  `effective_object_story_id`. Exclui `DELETED`/`ARCHIVED`. Mesmo modelo de segurança
  e privilégios de `artist_ads_campaigns`. O Google não tem nível anúncio na base —
  a coluna `platform` fica pronta para o futuro.

## Moeda de referência do artista (D-ERP92, 19/09/2026)

- Fonte única de câmbio no ERP: **BCE** (Frankfurter, `_shared/fx-rate.ts`). Com data
  não há fallback; sem taxa não se converte (NULL), nunca se inventa.
- `public.fx_rates_daily` (PK `rate_date, currency`): uma linha por **dia de
  calendário**, com `date_used` = dia do fixing usado, para o join por data ser
  igualdade. EUR não se grava (taxa 1 implícita). Leitura `authenticated`, escrita só
  `service_role`, `anon` sem privilégios.
- `public.fx_convert(amount, from, to, date)` — STABLE, SECURITY INVOKER, não
  arredonda; falta a taxa do dia → NULL.
- **Conversão AO DIA:** cada linha diária converte-se à taxa do seu dia; nunca um
  total a uma taxa única.
- Moeda de referência efectiva = `coalesce(artists.reporting_currency,
  companies.currency)` (CHECK: BRL, USD, GBP, EUR).
- `artist_ads_campaigns`/`artist_ads_ads` ganharam no fim `ref_currency`,
  `spend_7d_ref`, `spend_30d_ref`, `fx_missing_days`; `artist_ads_daily` ganhou
  `ref_currency`, `spend_ref`, `fx_missing_days`. `fx_missing_days` existe porque
  `sum()` ignora NULLs — sem ele um total incompleto passava por completo.
- Quem enche a tabela é a edge function `fx-rates-sync` (só `service_role`, série
  temporal do Frankfurter, um pedido por moeda; upstream em baixo → sync_run `error`
  + 502). Cron previsto `fx-rates-daily`, `10 0,16 * * *`, corpo `{}`.
