# Levantamento — motor de campanhas (Meta + Google) e acoplamento a evento

Modo leitura. Sem ficheiros alterados, sem migrações, sem deploys, sem syncs.
Onde não houve prova, está escrito "não confirmado".

## 1) Mapa Meta, ponta a ponta

| Etapa | Edge function | Lê | Escreve | Front |
|---|---|---|---|---|
| Estratégia (LLM) | `supabase/functions/crm-meta-campaign-strategy-generate/index.ts` | `public.events` (L127-129: `id, name, date, location, tickets_total`), token via `crm_get_meta_decrypted_token` (L116) | `crm.meta_campaign_strategies` (L454-459, com `event_id`) | `src/pages/crm/StrategyNew.tsx:150` |
| Deploy da estratégia | `crm-meta-strategy-deploy/index.ts` (1153 linhas) | `crm.meta_campaign_strategies` (L171), `public.events` (L189-190: `name, slug, meta_pixel_id, ad_destination_url, ticketing_url`), `crm.ad_platform_connections` (L280), `crm.ad_platform_account_links` (L310), `public.meta_custom_audiences` (L325-326), `crm.meta_strategy_creatives` (L441), `crm.meta_creatives` (L455/L483), `crm.meta_adset_snapshot` (L513) | `crm.meta_campaign_strategy_deployments` (L206/L383/L419/L1050), `crm.meta_campaign_snapshot` (L1082-1113), `crm.meta_campaign_strategies` (L1062/L1095) | `src/pages/crm/StrategyView.tsx:574` |
| Ligar/desligar deployment | `crm-meta-deployment-toggle/index.ts` | `crm.meta_campaign_strategy_deployments` (L62) | mesma tabela (L124/L131) | `src/pages/crm/StrategyView.tsx:623` |
| Preparar plano | `crm-meta-publish-prepare/index.ts` | `crm.campaign_design` (L172-173: `id, company_id, event_id, adsets`), `public.events` (L182: `id, name, company_id, date, ticketing_url`), `crm.meta_adset_snapshot` (L197); LLM via `LOVABLE_API_KEY` (L77-81) | `crm.meta_publish_plan` (L353/L412/L435, com `event_id` de `design.event_id` L401/L423) | `src/components/crm/MetaPublishPanel.tsx:344` |
| Criativos (upload) | `crm-meta-upload-creative-v2/index.ts` | ficheiro | `crm.meta_creatives.meta_video_id` / `meta_image_hash` | ecrãs de criativos (`src/pages/crm/Creative*.tsx`) |
| Publicação | `crm-meta-publish-execute/index.ts` (884 linhas) | `crm.meta_publish_plan` (L136-137), `crm.ad_platform_account_links` (L176), `crm.ad_platform_connections` (L193), `public.events` (L226/L237-238: `name, date, meta_pixel_id`), `crm.meta_creatives` (L266), `crm.meta_custom_audiences` (L343) | `crm.meta_publish_plan` (estado, `meta_campaign_id`, `adsets` jsonb — L772-872) | `src/components/crm/MetaPublishPanel.tsx:1172` e `:1207` |
| Activar | `crm-meta-publish-activate/index.ts` | plano (L103), links (L142) | plano (L168-280) | `MetaPublishPanel.tsx:215` |
| Acções sobre entidades | `crm-meta-entity-action/index.ts` | snapshots `meta_campaign_snapshot` / `meta_adset_snapshot` / `meta_ad_snapshot` | `crm.meta_entity_actions_log` (L311 sucesso, L391 falha), `crm.meta_campaign_changes` (L362), update do snapshot | `Campaigns.tsx:192`, `CampaignView.tsx:1024/1083`, `ConfirmMetaActionDialog.tsx:108/163`, `EditCampaignPopover.tsx:118`, `CampaignAnalysisSheet.tsx:185`, `EditAdsetBudgetDialog.tsx` |
| Sync de volta | `crm-meta-sync-campaigns`, `-adsets`, `-ads`, `-creatives`, `-insights` | Graph API | snapshots + `*_insights_daily` + `crm.meta_creatives`; chamam `artist_ads_autolink_songs_internal` (`crm-meta-sync-campaigns/index.ts:283`) | `src/pages/crm/Campaigns.tsx:690/704/718/732/750` |

Estado com que nasce: **sempre `PAUSED`**.
- Ads: `crm-meta-publish-execute/index.ts` L679 e L691 — `{ name, adset_id, status: "PAUSED", creative }`.
- Reels isolados: `crm-meta-create-reels-ad/index.ts` (PAUSED hardcoded, `dry_run` default true).
- A activação é acto separado (`crm-meta-publish-activate`, `crm-meta-entity-action`).
- No caminho `strategy-deploy` não confirmei em que estado nascem campanha/adsets (o ficheiro tem 1153 linhas e não li o bloco de criação inteiro).

RPCs SQL usadas: `crm_get_meta_decrypted_token` (todas as funções Meta), RPC de capacidade/limite de orçamento invocada em `crm-meta-strategy-deploy:232` e `crm-meta-entity-action:105` (nome exacto não confirmado neste levantamento), `artist_ads_autolink_songs_internal`.

## 2) Mapa Google

Doc canónica: `docs/features/crm-google-publish-flow.md`.

| Etapa | Função | Lê | Escreve | Front |
|---|---|---|---|---|
| Lookups (metas de conversão, geo) | `crm-google-publish-lookups/index.ts` | `crm.ad_platform_connections` (L63), `crm.google_conversion_action` (L127) | — | `GooglePublishPanel.tsx` |
| Criar plano | — (insert directo do front) | `public.events` (`GooglePublishPanel.tsx:99-101`) | `crm.google_publish_plan` (`:231` `event_id: eventId`, `:263` insert) | `src/components/crm/GooglePublishPanel.tsx`, montado em `src/pages/audience/AudienceGoogleAds.tsx:91` |
| Publicar (dry-run + cadeia) | `crm-google-publish-execute/index.ts` | `crm.google_publish_plan` (L210/L338) | mesmo plano (`resource_name` após cada `:mutate`, L301-338) | `GooglePublishPanel.tsx:291` (dry) e `:311` |
| Activar/pausar | `crm-google-publish-activate/index.ts` | plano (L58) | plano (L107) | `GooglePublishPanel.tsx:329` |
| Sync de volta | `crm-google-sync-campaigns/index.ts`, `crm-google-ads-sync` | Google Ads API | `crm.google_campaign`, `google_ad_group`, `google_asset_group`, `google_keyword`, `google_campaign_insights_daily`; autolink de músicas em `crm-google-sync-campaigns:628` | `src/pages/crm/Campaigns.tsx:777` |
| Conversões | `crm-google-conversion-upload`, `crm-google-lead-conversion-enqueue`, `crm-google-click-ingest` | `crm.google_conversion` (status `pending`), `crm.google_click` | `crm.google_conversion` (status), `crm.google_click` | página do portal / cron |
| Públicos | `crm-google-customer-match-sync`, `crm-google-user-list-ensure` | `crm.google_user_list` | `crm.google_user_list`, `crm.google_user_list_job` | `docs/features/customer-match-ensure.md` |

Estado inicial: **tudo PAUSED** (orçamento, campanha, grupo, anúncio) — doc TL;DR e `campaignPayload()`. `dry_run` é o default; só escreve com `dry_run: false`.
Cadeia: `campaignBudgets` → `campaigns` (SEARCH) → `adGroups` → `adGroupCriteria` (keywords +/−) → `campaignCriteria` (geo/idioma) → `adGroupAds` (RSA). Só Pesquisa; PMax/Demand Gen/YouTube fora de âmbito.

## 3) Acoplamento a evento

**(a) Validações que exigem `event_id`**
- `crm-meta-campaign-strategy-generate/index.ts:92-93` — `missing_params` se faltar `event_id`.
- `crm.meta_publish_plan.event_id` e `crm.google_publish_plan.event_id` são NOT NULL (confirmado por ti em Live).
- `crm-campaign-design-generate/index.ts:210-215` — `forbidden` se o evento não pertencer ao company.
- `crm-meta-publish-execute/index.ts:744-748` — objectivo de conversões exige `events.meta_pixel_id`.
- `crm-meta-strategy-deploy/index.ts:550-559` — `no_pixel_available` quando não há pixel de evento nem da campanha-fonte.

**(b) Leituras de evento/bilheteira**
- `crm-meta-publish-prepare:182` (`name, date, ticketing_url`), `crm-meta-publish-execute:226/237-238` (`name, date, meta_pixel_id`), `crm-meta-strategy-deploy:189-190` (`name, slug, meta_pixel_id, ad_destination_url, ticketing_url`), `crm-meta-campaign-strategy-generate:127-129` (`name, date, location, tickets_total`), `crm.event_active_triggers` em `crm-campaign-design-generate:223-225`.

**(c) Prompts LLM que assumem evento**
- `crm-meta-campaign-strategy-generate/index.ts:220` — «És um especialista em Meta Ads para a indústria de eventos ao vivo (concertos, festivais)… vender ingressos»; variáveis `Dias até o evento` (L227), `Capacidade: … ingressos` (L229), `Ticket médio` (L231), `ROAS alvo … META BLENDED do evento` (L234), fases em `D-X a D-Y dias antes do evento` (L254), `must_include: ["data do evento","venue","preço a partir de"]` (L362).
- `crm-campaign-design-generate/index.ts:112` — exemplo de copy «Garante o teu bilhete»; prompt por adset construído a partir dos gatilhos do evento.
- `crm-meta-publish-prepare/index.ts:77-81` — chamada LLM; conteúdo do prompt não inspeccionado em detalhe (não confirmado se menciona evento).

**(d) Naming**
- Campanha Meta: `crm-meta-publish-execute:291` — `` `[MP Audience] ${nomeEvento}${dataEvento ? ` - ${dataEvento}` : ""}` ``.
- Adset: `:421` — `a.trigger_nome || "Adset"` (neutro).
- Ads: nome vem do payload do plano (`nomeAd`, L679/L691) — neutro.
- `crm-meta-strategy-deploy`: nomes vêm do plano da estratégia (`planCampaign.campaign_name` L613, `planAdset.adset_name` L773) — neutro.
- Google: nomes vêm do formulário do plano — neutro.

**(e) UTMs e URL de destino**
- Não existe geração de UTMs em nenhuma função de publicação (`rg utm_` só devolve `crm-google-click-ingest` e ecrãs de leads). O destino é um campo:
  - Meta plano: `link_destino` (`crm-meta-publish-execute:205-211`, erro `sem_link_destino` a 412) — neutro.
  - Meta deploy: `events.ad_destination_url` com fallback `events.ticketing_url` (`crm-meta-strategy-deploy:190-192`, aviso L974-976) — **acoplado**.
  - Google: `final_urls` do plano — neutro.

**(f) Pixel, conversões e públicos**
- Pixel: `events.meta_pixel_id` é a fonte de verdade (`crm-meta-strategy-deploy:177-192`, precedência evento-primeiro L535-543; `crm-meta-publish-execute:246/449`), `promoted_object = { pixel_id, custom_event_type: "PURCHASE" }`.
- Público de compra: `public.meta_custom_audiences` escolhida por `event_id` (`crm-meta-strategy-deploy:325-357`).
- Google: `crm.google_conversion` com `order_id = lead_capture.id` (`crm-google-conversion-upload:260`); `crm.google_click.event_id` (FK a `events`).

**(g) Auto-link**
- Campanha → evento: `crm.meta_campaign_snapshot.linked_event_id/linked_event_locked` e `crm.google_campaign.linked_event_id/linked_event_locked`.
- Campanha → música: `linked_song_id/linked_song_locked` + `artist_ads_autolink_songs_internal` (`crm-meta-sync-campaigns:283`, `crm-google-sync-campaigns:628`) — já é o padrão paralelo ao evento.

**(h) RLS e FKs**
- RLS: **nenhuma policy no schema `crm` cujo `USING`/`WITH CHECK` mencione evento** (consulta a `pg_policy` devolveu 0 linhas). O isolamento é por `company_id`.
- FKs para `events` no schema `crm` (`pg_constraint`): `event_active_triggers.event_id` (CASCADE), `funnel_test_runs.event_id` (SET NULL), `google_click.event_id` (SET NULL), `google_publish_plan.event_id` (CASCADE), `google_campaign.linked_event_id` (SET NULL), `meta_campaign_snapshot.linked_event_id` (SET NULL), `meta_campaign_strategies.event_id` (SET NULL).
- **`crm.meta_publish_plan.event_id` não tem FK** para `events` (não aparece na lista) — é NOT NULL sem integridade referencial.
- Colunas `event_id` no schema `crm`: `assisted_assembly`, `campaign_design`, `campaign_memory`, `creative_message_validation`, `event_active_triggers`, `event_active_triggers_log`, `funnel_test_runs`, `google_click`, `google_publish_plan`, `meta_campaign_strategies`, `meta_publish_plan`. Único `artist_id`: `ad_platform_connections`, `oauth_states`. Nenhuma tabela `crm` tem `song_id`.

**(i) Ecrãs que só funcionam dentro de um evento**
- `src/pages/audience/AudienceGoogleAds.tsx` — selector de evento obrigatório (`:72`, `:90-91`).
- `src/components/crm/GooglePublishPanel.tsx` — prop `eventId: string` obrigatória (`:64`, `:79`).
- `src/pages/crm/StrategyNew.tsx` — gera estratégia com `event_id`.
- `src/pages/crm-admin/eventos/*` — editor de marketing por evento.

**NEUTRO (reutilizável tal e qual)**: `crm.meta_creatives` e todo o upload/sync de criativos; `crm-meta-entity-action` (não conhece evento; opera por `connection_id` + `external_id`); `crm-meta-deployment-toggle`; todos os `crm-meta-sync-*` e `crm-google-sync-campaigns`; `crm.meta_campaign_strategy_deployments`, `crm.meta_strategy_creatives`, `crm.meta_entity_actions_log`, `crm.meta_campaign_changes`, snapshots e `*_insights_daily`; `_shared/google-ads.ts`, `_shared/google-rsa-validation.ts`; toda a cadeia `:mutate` do Google; naming de adset/ad; `link_destino`/`final_urls` como campo do plano.

## 4) Autenticação das funções de publicação

- `supabase/config.toml` não tem entrada para nenhuma função de publicação → fica no default do projecto (`verify_jwt` implícito). As entradas existentes (47 ocorrências) são para outras funções.
- `crm-meta-publish-execute:112-127` — exige header `Authorization` (401 `missing_authorization`), cria cliente de utilizador **e** cliente `service_role` (L130) para escrever.
- `crm-meta-publish-prepare:105-129` — idem.
- `crm-meta-publish-activate:76-109` — exige sessão, `auth.getUser()`, e valida `planRow.company_id === companyIdIn` (403).
- `crm-meta-strategy-deploy:142`, `crm-meta-entity-action:94`, `crm-meta-deployment-toggle:58` — `auth.getUser()` obrigatório, 401 sem sessão.
- `crm-google-publish-activate:47-54` e `crm-google-publish-lookups:50-58` — cliente de utilizador + `getUser()`; 401 sem sessão. `crm-google-publish-execute` usa `SUPABASE_SERVICE_ROLE_KEY` (L26) e **não vi verificação de sessão nas primeiras 130 linhas** — não confirmado se valida papel mais abaixo.
- Papéis: não encontrei verificação explícita de `has_role` nestas funções; o gate efectivo é sessão + `company_id` do plano + RLS nas leituras feitas com o cliente de utilizador. Limites de orçamento por papel existem em `crm.role_budget_limits`, consultada via RPC em `crm-meta-strategy-deploy:232` e `crm-meta-entity-action:105`.
- **Nenhuma** destas funções usa `_shared/internal-call.ts` (só `artist-comparable-manage`, `artist-song-manage`, `soundcharts-reference-songs`).

## 5) Idempotência e log

- Meta: não há chave de idempotência do chamador. A idempotência é por estado persistido — rejeita `publicado` com 409 `ja_publicado` (`crm-meta-publish-execute:145`), aceita `rascunho|pronto_a_publicar|a_publicar|falhado` (L147), marca `a_publicar` + `publish_started_at` (L772-774), reutiliza `meta_campaign_id` (L784-790) e reescreve o `adsets` jsonb com os IDs criados após cada sucesso (L794-820). Não vi lock anti-corrida por tempo no Meta (o Google tem).
- Google: mesmo modelo, mais robusto — `persist()` após cada `:mutate`, salto por `resource_name` já preenchido, lock `estado <> 'a_publicar' OR publish_started_at < now()-5min`, match por `uid` interno.
- Log Meta: `crm.meta_entity_actions_log` (`company_id, connection_id, ad_account_id, entity_type, external_id, entity_name, action, prev_status, new_status, updates_jsonb, success, error_message, meta_response_jsonb, performed_by`) + `crm.meta_campaign_changes` (before/after jsonb, `change_type`, `reason_text`, `diagnosis_id`, `triggered_by`, `applied_by_user_id`).
- **Google não tem equivalente**: nenhuma escrita em tabela de log em `crm-google-publish-execute` nem em `crm-google-publish-activate`. Existe `crm.ad_manager_audit_log` (particionada) mas não confirmei quem a escreve.

## 6) Criativos

- Fluxo Meta (doc `docs/features/crm-meta-publish-flow.md`): upload → `/advideos` (`meta_video_id`) ou `/adimages` (`meta_image_hash`) em `crm-meta-upload-creative-v2`; `crm-meta-publish-execute` lê `crm.meta_creatives` (L266) e classifica em 3 ramos: imagem (`link_data.image_hash`), vídeo (`video_data.video_id`), reused (`creative: { creative_id }`); sem nenhum → `creative_sem_meta_id` e o ad não é criado. O publish-execute **não sobe vídeo na hora**. Tecto de 50 ads/adset.
- Post existente / parceria: **não existe caminho de publicação**. `object_story_id` / `effective_object_story_id` / `source_instagram_media_id` aparecem apenas em **leitura** no `crm-meta-sync-creatives` (L206-251, L346-347, L753-756) e no `crm-meta-sync-ads` (raw.creative, D-ERP91). Nenhuma função monta `object_story_id` num criativo novo, e não há nada de branded content/partnership ads.
- Google: **nenhum caminho para vídeo de YouTube** — `rg 'youtube|video'` em `crm-google-publish-execute` e `crm-google-ads-sync` devolve zero. Só RSA de Pesquisa.

## 7) TikTok

Confirmado: **não existe nada de TikTok Ads/Marketing API**. Os ficheiros com "tiktok" são todos orgânicos/oauth de conteúdo: `artist-tiktok-oauth-start/callback`, `artist-tiktok-sync`, `_shared/artist-tiktok.ts`, `artist-token-refresh`, `artist-shorts-sync`, `artist-song-report`, `soundcharts-sync`, `song-soundcharts-sync`, `artist-comparable-manage`, `artist-connection-disconnect`, `src/pages/crm/Connections.tsx`. Zero ocorrências de `business-api.tiktok`, `ads.tiktok` ou `advertiser_id`. Em `crm.*` só `ad_platform_connections.platform` e `oauth_states.platform` aceitam `'tiktok'`; `crm-meta-strategy-deploy:493` tem apenas um comentário DEBT sobre multi-plataforma. Nenhuma tabela `crm.tiktok_*`.

## 8) Riscos de generalizar para alvo `artista+música`

1. `event_id` NOT NULL nos dois planos (`meta_publish_plan`, `google_publish_plan`) obriga a tornar a coluna anulável ou a criar um discriminante de alvo — mexer no CHECK/NOT NULL de tabelas com dados vivos (1 e 3 linhas) é barato, mas qualquer código que faça `.eq("event_id", ...)` sem guarda passa a devolver conjuntos errados.
2. Pixel: o motor Meta está construído em torno de `events.meta_pixel_id` com `custom_event_type: "PURCHASE"`. Uma campanha de música não tem compra de bilhete; sem alvo de conversão equivalente, todos os objectivos de conversão ficam bloqueados por `no_pixel_available` / `sem_pixel_para_conversoes`.
3. Naming: `[MP Audience] <evento> - <data>` é literal em `crm-meta-publish-execute:291`. Qualquer alternativa tem de ser adicionada sem alterar o ramo do evento, ou o naming histórico muda.
4. Destino: no caminho `strategy-deploy` o link vem de `events.ad_destination_url`/`ticketing_url`. Para música seria preciso um campo equivalente em `artist_songs` (não existe hoje; não confirmado).
5. Prompts LLM: os prompts de estratégia e de design estão saturados de conceitos de bilheteira (capacidade, ticket médio, ROAS blended, D-X, venue). Um alvo música exige um segundo prompt — reaproveitar o actual produziria copy errada.
6. Públicos: a exclusão de compradores usa `meta_custom_audiences.event_id`. Sem equivalente por artista/música, a lógica de exclusão cai em silêncio (só `warn`).
7. Idempotência Meta sem lock temporal: se a UI de artista permitir duas publicações concorrentes, o estado `a_publicar` pode prender o plano (problema já resolvido no Google, não no Meta).
8. Google: a cadeia só sabe Pesquisa/RSA. Divulgação de música pede YouTube/Demand Gen, que hoje **não existem** — generalizar o alvo não desbloqueia o canal.
9. Ausência de log de publicação no Google torna difícil provar que o comportamento de evento se manteve inalterado após a generalização.
10. `connection_scope='artist'` traz outra empresa e outra moeda (Litto = BRL) para dentro de funções que hoje assumem a moeda do plano/conta e o `company_id` do evento; os gates de orçamento (`role_budget_limits`) são em valor absoluto — não confirmado se convertem moeda.
11. Não confirmado: em que estado nascem campanha/adsets no `crm-meta-strategy-deploy`, e se `crm-google-publish-execute` valida papel do utilizador. Ambos precisam de leitura dirigida antes de desenhar o modelo.
