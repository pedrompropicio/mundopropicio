# ESTADO — MP Audience · Google Ads

Atualizado: 2026-08-29 (herdado — confirmar) · Issues: `a-seguir` #62, #69, #70

## Em que pé está
Dashboard funcional com campanha real "[NEW] Ivete Clareou - Cascais 2026" (DEMAND_GEN, ENABLED). Sync **manual por botão** — cron rejeitado por decisão do Pedro. Arquitetura: **tudo Ads → MP Audience; tudo Lead/CRM → MP CRM**.

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
