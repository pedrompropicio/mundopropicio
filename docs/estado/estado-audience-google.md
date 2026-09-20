# ESTADO — MP Audience · Google Ads

Atualizado: 2026-09-19 · Issues: `a-seguir` #62, #69, #70

## Em que pé está
Dashboard funcional com campanha real "[NEW] Ivete Clareou - Cascais 2026" (DEMAND_GEN, ENABLED). Sync **manual por botão** — cron rejeitado por decisão do Pedro. Arquitetura: **tudo Ads → MP Audience; tudo Lead/CRM → MP CRM**.

**Motor único de campanhas — F1 fundações (19/09, D-ERP95):** `crm.google_publish_plan` aceita evento XOR artista+música; nasceu `crm.ads_entity_actions_log` (log de acções Google/TikTok, que não existia) com vista unificada `crm.v_ads_entity_actions_log`. Só schema — comportamento inalterado; alvo música na F2/F3, com prioridade a Demand Gen com vídeo do canal YouTube.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
**#62 (P1)** — leads do CRM não alimentam o Google Ads: cadeia de atribuição partida em 3 pontos. É o bloqueador do eixo lead→conversão.

## Bloqueios
- **Customer Match sem elegibilidade** — conta `220-004-3144` dá `403 PERMISSION_DENIED` para escrita. Gate **account-side**, não código.
- **#69** — drift em `crm-google-click-ingest`.
- **#70** — o portal grava 2 linhas de `google_click`.

## Factos que não se reinvestigam
- Conta `220-004-3144` · MCC `974-322-1780` · service account `mp-audience-api@mp-audience.iam.gserviceaccount.com`.
- `GOOGLE_SA_KEY_JSON` e `GOOGLE_ADS_DEVELOPER_TOKEN` no Vault. Coluna `login_customer_id` em `crm.ad_platform_connections`.
- **Google Ads API v24** — `campaign.start_date`/`end_date` e `pageSize` removidos. v17 e v20 obsoletas.

## Onde ler mais
- `docs/handoffs/` — estado-google-ads-2026-08-28, google-data-manager-api-migracao-2026-08-29

## Métricas de vídeo (20/09/2026)
`crm-google-video-metrics-sync` escreve em colunas próprias —
`google_campaign_insights_daily.video_metrics`, `google_campaign.settings` e `.reach`.
Antes escrevia em `raw`/`metrics` e o cron 242 (3h) apagava tudo. `artist_ads_daily` e
`artist_ads_campaigns` lêem `coalesce(video_metrics->>'video_views', raw->>'video_views')`.
Cron por criar em Live: `crm-google-video-metrics-3h`, `'20 */3 * * *'`, `{"days":7}`.
