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

## Nível anúncio e trinco das ligações (D-ERP93, 19/09/2026)

- **Estados herdados:** um anúncio/conjunto cujo PAI foi pausado não fica `PAUSED`,
  fica `CAMPAIGN_PAUSED` ou `ADSET_PAUSED` (este só ao nível anúncio). `crm-meta-sync-ads`
  filtra ACTIVE/PAUSED/CAMPAIGN_PAUSED/ADSET_PAUSED e `crm-meta-sync-adsets`
  ACTIVE/PAUSED/CAMPAIGN_PAUSED. Nunca alargar a DELETED/ARCHIVED.
- **`artist_ads_ads` parte da UNIÃO** insights de 30 d + snapshot. Sem ficha no
  snapshot: nomes de anúncio/conjunto/campanha vêm dos insights (valor mais recente) e
  `status`/`creative_id`/`thumbnail_url`/`permalink` ficam NULL. DELETED/ARCHIVED só se
  excluem se NÃO tiveram gasto na janela.
- **Invariante:** por campanha, `sum(spend_30d)` de `artist_ads_ads` =
  `spend_30d` da campanha em `artist_ads_campaigns`. Verificado em Live (4 campanhas do
  Litto, diff 0,00; 3.421,67 em 17 anúncios).
- **Trinco `linked_song_locked`** em `crm.meta_campaign_snapshot` e `crm.google_campaign`
  (a par de `linked_event_locked`): qualquer decisão humana fecha o trinco —
  `artist_ads_link_song` ao ligar e a nova `artist_ads_unlink_song(platform, campaign_id,
  artist_id)` ao desligar. `crm.artist_ads_autolink_songs_core` só toca em linhas com
  `linked_song_id IS NULL AND NOT linked_song_locked`.
- Os upserts dos syncs nunca escrevem `linked_song_id` nem `linked_song_locked`.

## Segurança das RPCs (D-ERP94, 19/09/2026)

- `artist_ads_assert_access` deixa passar **sem sessão de propósito** (cron/service_role) —
  por isso a protecção destas RPCs é o **privilégio, não o corpo**: as oito funções
  `artist_ads_*` têm `REVOKE EXECUTE FROM PUBLIC, anon` e `GRANT` só a
  `authenticated` + `service_role` (verificado em Live).
- **Regra permanente:** toda a função `artist_*` SECURITY DEFINER leva `REVOKE` de PUBLIC
  e `anon` na mesma migração que a cria ou recria; ao fazer DROP+CREATE nunca repor grant
  a `anon`.
- Pendente de decisão (cruzar com o front Gestão Artística, páginas públicas `/kit/:slug`):
  `artist_song_playlist_streams_set` é a única SECURITY DEFINER `artist_*`/`song_*`/
  `soundcharts_*` ainda executável por `anon`; escreve, mas exige sessão e papel no corpo
e não aparece em nenhuma policy de RLS.
  **Fechado a 19/09 (D-ERP95):** o acesso anónimo foi revogado à mão em Live com
  autorização do Pedro e repetido de forma idempotente na migração F1 —
  `anon` sem EXECUTE, `authenticated` + `service_role` com EXECUTE.

## Motor único de campanhas — F1 fundações (D-ERP95, 19/09/2026)

- O motor de construção/publicação de campanhas é ÚNICO com dois alvos: evento
  (inalterado byte a byte) OU artista+música. `crm.meta_publish_plan`,
  `crm.google_publish_plan` e `crm.meta_campaign_strategies` ganharam `artist_id` +
  `song_id` anuláveis com FKs verdadeiras (RESTRICT); `event_id` passou a anulável nos
  dois planos e `meta_publish_plan.event_id` ganhou pela primeira vez FK para
  `public.events` (CASCADE). `meta_publish_plan` tem ainda `connection_id`.
- CHECKs: planos exigem **exactamente um alvo**; estratégias aceitam **no máximo um**
  (há 9 antigas sem evento). Trigger `crm.assert_song_target_coherent()` nas três
  tabelas: alvo música só aceita connection `connection_scope='artist'` do mesmo
  artista e empresa.
- **`crm.artist_ads_budget_caps`**: teto de orçamento diário por connection, na moeda
  da conta; nasce vazia e SEM TETO O MOTOR RECUSA publicar/activar (fechado por
  omissão). Leitura: autenticado da própria empresa; escrita: só service_role.
- **`crm.ads_entity_actions_log`**: log de acções Google/TikTok (forma da
  `meta_entity_actions_log` + `platform` + `approved_by`); vista unificada
  `crm.v_ads_entity_actions_log` (security_invoker) = Meta ∪ Google/TikTok.
- F1 é só schema. F2: resolvedor `_shared/campaign-target.ts`, smart link + UTMs (só
  alvo música), lock anti-corrida Meta; F3: activação (publicar alvo música exige
  papel de tráfego/admin da Social Artists; activar só admin/platform_admin).
  Campanhas nascem SEMPRE PAUSED. Visibilidade: sem excepção à fronteira por
  `company_id` — quem precisa de ver recebe papel na Social Artists.

## Motor único de campanhas — F2a (D-ERP95, 19/09/2026)

Migração `20260919105937_...`. `public.artist_songs.smart_link_url` (CHECK `^https://`);
`crm.meta_publish_plan.design_id` já não é NOT NULL (CHECK
`meta_publish_plan_event_needs_design`: só o plano de EVENTO exige desenho).

RPCs novas em `public`, todas com guard `artist_ads_assert_access` e só sobre connections
`connection_scope='artist'`:
- leitura — `artist_ads_budget_cap_get` (uma linha por connection, com `has_cap`/`daily_cap`
  para a app mostrar "sem teto definido — publicação bloqueada"), `artist_ads_plan_list`,
  `artist_ads_plan_get` (jsonb completo), `artist_ads_promotable_posts`.
- escrita — `artist_ads_song_set_smart_link`, `artist_ads_plan_create`,
  `artist_ads_plan_update` (só `rascunho`/`falhado`). Exigem SESSÃO + papel
  `admin|platform_admin|manager|marketing_manager` via novo `artist_ads_assert_write`;
  o `service_role` não escreve por aqui (não tem `auth.uid()`).
- auxiliar — `artist_ads_plan_validate(jsonb, text)`.
Todas com `REVOKE EXECUTE FROM PUBLIC, anon` na mesma migração (regra D-ERP94).

Objectivo do plano de música: `AWARENESS|TRAFFIC|ENGAGEMENT` — conversões nunca.
`link_destino` cai para `artist_songs.smart_link_url` quando não vem no plano.

`artist_content.external_id`: com `source='platform_api'` é o **media id numérico do
Instagram Graph** (utilizável na Marketing API); com `source='aggregator'` é o
**shortcode** (não utilizável) → `meta_ready=false`. `artist_ads_promotable_posts`
prefere a fonte `ad_history` (`crm.meta_ad_snapshot.raw->'creative'`) e não duplica.

`crm-meta-publish-execute`: `dry_run` já existia com default **TRUE** e assim fica.
F2a só acrescentou, fora do caminho de escrita: leitura de `artist_id/song_id/connection_id`,
`{ ok:false, error:'alvo_musica_f2b' }` para planos de música, guardas de estado só quando
`dry_run` é false (dry-run permitido em qualquer estado, incluindo `publicado`) e
`ok:true` + `estado_plano` na resposta. Construção de payloads continua partilhada.

## Motor único de campanhas — F2b (D-ERP95, 19/09/2026)

Publicação do alvo música na Meta. Resolvedor único `_shared/campaign-target.ts`
(`resolveTarget`): evento = extracção literal (mesmas queries/ordem/erros, hook
`onAccountResolved` mantém o `sem_link_destino` no ponto exacto); música = conta,
token, Página e Instagram da ligação do plano, sem pixel, com derivação de
`selected_page_id` (prefixo de `effective_object_story_id` mais frequente em
`crm.meta_ad_snapshot`) e de `selected_instagram_id` (Graph API) gravadas na ligação
— nunca em dry_run.

Regras do alvo música: publicar exige sessão + `artist_ads_assert_write` (service_role
nunca publica; dry_run/preflight aceitam service_role); teto obrigatório em
`crm.artist_ads_budget_caps` (`sem_teto`, `acima_do_teto`, `moeda_do_teto_diferente`),
contando o diário já comprometido pelos outros planos publicados/activos da ligação;
objectivos AWARENESS/TRAFFIC/ENGAGEMENT → OUTCOME_AWARENESS+REACH /
OUTCOME_TRAFFIC+LINK_CLICKS+WEBSITE / OUTCOME_ENGAGEMENT+THRUPLAY+ON_VIDEO, nunca
`promoted_object` de pixel; naming `[MP] [TÍTULO] [Alcance|Tráfego|Visualizações] data`
e prefixo `[MP] ` em conjuntos/anúncios; `url_tags` geradas pelo motor; `existing_post`
validado contra `artist_ads_promotable_posts` (`meta_ready=true`); tudo PAUSED; lock
anti-corrida `ja_em_publicacao`; upsert no espelho `crm.meta_campaign_snapshot` com
`linked_song_id` + `linked_song_locked=true` na criação; criações registadas em
`crm.meta_entity_actions_log` com `action='create'` (CHECK estendido na migração
20260919160000). Modo `preflight:true` só faz GETs e devolve `checks[]`.
`crm-meta-publish-activate` responde `alvo_musica_f3` a planos de música.

Invariante de eventos: o dry_run do plano `93529702-76c7-491f-95dd-040ed7fcee25` tem
de continuar a devolver md5 `0e2801d625781a22a1e4bb33fb0a0f6d`.

## F2b — correcção: geografia obrigatória (D-ERP95, 19/09/2026)

**Alvo música não tem geografia por omissão; sem país o motor recusa.** Campos do contrato do
plano: `publico_sugerido.geo` (países ISO-2 ou nome normalizável), `idade_min`, `idade_max`
(default 18–65). Em `crm-meta-publish-execute` (`kind:'song'`): publicação real e `preflight`
devolvem `422 error:'sem_geografia'`; `dry_run` devolve o payload sem `geo_locations` e com o
aviso `sem_geografia`. `public.artist_ads_plan_validate` recusa adset sem país. `url_tags`
(UTMs) só vai no criativo quando há destino efectivo. O default `["PT"]` do alvo evento
mantém-se — nada no caminho de evento mudou.
