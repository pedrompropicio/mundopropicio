# Issue #562 — inventário de preparação (03/11/2026)

**Preparado, não aplicado. Isolamento ainda não aceite. Não autoriza criar empresas, seed, SQL, cron, envio, deploy, Publish ou merge.**

Fonte local: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json`; SHA-256 `4e34f270ef1f8b9b63c8c8a9a5ddbda095971708fa0d8a35690cb979bcd98adc`. O array tem **80 jobs, 72 ativos e 8 inativos**. O metadado `total` diz 81; a contagem acima resulta do array, sem inventar a entrada em falta. Snapshot de 24/10; não representa uma consulta atual a Live.

Os comandos estão integralmente redigidos (`command_sanitized = <redigido>`). `referenced_functions = net.http_post` não identifica URL, payload ou empresa. As linhas abaixo distinguem prova local do predicado e lacuna do corpo do cron. Não inferimos que o nome do job prova o destino.

## Barreiras preparadas

- B1: `issue562_no_integrations`, BEFORE INSERT/UPDATE nas nove tabelas nomeadas no despacho, incluindo `crm.ad_platform_connections`.
- B2: `issue562_suppress_output`, BEFORE INSERT nas filas; guards das seis edges antes dos destinatários/envio; exportações reais recusadas na base e omitidas na UI de treino.
- B3: dezoito famílias de invariantes com âmbito explícito; as funções públicas antigas delegam para `_scoped(false)`. A corrida de treino usa `_scoped(true)`, referência própria zero e `scope_training=true`, sem lembretes. Catálogo, segredos e checks globais sem proprietário continuam globais.

## Cron a cron — todos os ativos

| ID / job | Agenda UTC | Predicado e origem verificável | Barreira / conclusão |
|---|---|---|---|
| 5 / `cleanup-old-backups` | `0 4 * * 0` | `sem funções extraídas`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:11` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 6 / `monthly-backup-test` | `0 5 1 * *` | `sem funções extraídas`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:23` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 19 / `crm-measure-action-impact` | `0 4 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:105` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 20 / `crm-pause-replaced-originals` | `0 5 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:119` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 25 / `whatsapp_dispatcher_minute` | `*/5 * * * *` | Fila `status=queued`, `scheduled_at<=now`, `attempts<3` → `supabase/functions/whatsapp-dispatcher/index.ts:87`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:147` | B2: guard por `company_id` antes de sending/POST; treino vira skipped/suppressed_training. Definição histórica em supabase/migrations/20260522120039_029a6059-76fb-4eaf-ba70-9c9ab567b6bf.sql:25. |
| 27 / `ticketline-sync-daily` | `5 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:161` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 35 / `crm-meta-audiences-daily-sync` | `0 4 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:175` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 42 / `crm-google-lead-conversion-enqueue` | `*/15 * * * *` | `.eq(company_id, MP_COMPANY_ID)` → `supabase/functions/crm-google-lead-conversion-enqueue/index.ts:118`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:203` | Não alcança novas empresas de treino: UUID fixo da MP. Não alterado. Corpo net.http_post redigido: destino do job não reconfirmado. |
| 43 / `crm-google-conversion-upload` | `7-59/15 * * * *` | `.eq(company_id, MP_COMPANY_ID)` → `supabase/functions/crm-google-conversion-upload/index.ts:147`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:217` | Não alcança novas empresas de treino: UUID fixo da MP. Não alterado. Corpo net.http_post redigido: destino do job não reconfirmado. |
| 87 / `bilheteira-sync-daily` | `0 8 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:231` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 88 / `bol-sync-daily` | `25 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:245` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 89 / `vip-coupon-reminder-daily` | `30 8 * * *` | `run_vip_coupon_reminder`: `name = 'email_queue_service_role_key'` → `supabase/migrations/20260820135937_cd9ae973-08cf-4884-a1d2-4dd9f477baf4.sql:97`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:259` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 90 / `ticketline-capture-day-hourly` | `15 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:273` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 91 / `ticketline-capture-day-seal` | `25 0 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:287` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 92 / `leads-capi-health` | `7 * * * *` | `check_leads_capi_health`: `capi_status is null or capi_status = 'retry';` → `supabase/migrations/20260823020821_281d529c-5dba-4666-bf36-2d2af5a012ad.sql:1`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:301` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 93 / `crm-meta-insights-hourly` | `40 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:315` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 94 / `carreira-suamusica-sync-diario` | `0 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:329` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 96 / `carreira-instagram-sync-diario` | `20 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:343` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 97 / `carreira-soundcharts-sync-diario` | `10 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:357` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 99 / `carreira-song-sync-diario` | `40 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:371` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 100 / `carreira-shorts-sync-diario` | `50 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:385` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 101 / `carreira-song-report-diario` | `0 10 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:399` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 102 / `carreira-tiktok-sync-diario` | `55 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:413` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 107 / `carreira-reference-songs-semanal` | `35 9 * * 0` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:427` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 131 / `invariant-checks-daily` | `10 7 * * *` | `_run_invariant_checks_all()` → `supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql:144`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:441` | B3 parcial: famílias com empresa filtradas; callbacks #335 sem âmbito são LACUNA. Cron não alterado. |
| 207 / `daily-database-backup` | `0 3 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:455` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 241 / `crm-meta-campaigns-hourly` | `25 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:483` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 242 / `crm-google-sync-campaigns-3h` | `10 */3 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:497` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 249 / `fx-rates-daily` | `10 0,16 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:511` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 261 / `carreira-song-report-stale` | `*/15 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:525` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 262 / `cron-purge-run-details` | `15 3 * * *` | `sem funções extraídas`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:539` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 267 / `carreira-tiktok-sync-catalogo-semanal` | `10 4 * * 0` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:551` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 268 / `carreira-instagram-sync-catalogo-semanal` | `40 4 * * 0` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:565` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 269 / `carreira-meta-breakdowns-diario` | `20 10 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:579` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 270 / `carreira-google-breakdowns-diario` | `25 10 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:593` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 276 / `crm-google-video-metrics-3h` | `20 */3 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:607` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 300 / `ticketline-sync-runs-retention` | `20 3 * * *` | `ticketline_sync_runs_compact_audit`: `r.import_audit IS NOT NULL` → `supabase/migrations/20260920203128_d7454319-0717-4268-a4fe-045e26914f5b.sql:1`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:621` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 301 / `traffic-events-anonymize` | `40 3 * * *` | `anonymize_traffic_events`: `kind = 'redirect_click'` → `supabase/migrations/20260920203220_20489d49-c410-4287-b41e-9fe5b5d90321.sql:1`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:635` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 305 / `meta-creatives-retention` | `10 4 * * 0` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:649` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 349 / `onebox-sync-hourly` | `35 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:663` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 602 / `carreira-tiktok-artists-sync-diario` | `40 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:677` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 645 / `carreira-tiktok-sounds-daily` | `30 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:691` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1142 / `carreira-s4a-daily-sync` | `30 8 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:705` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1382 / `carreira-youtube-purge-revogados-diario` | `0 4 * * *` | `purge_revoked_youtube_data`: `ac.platform = 'youtube' AND ac.revoked_at IS NOT NULL AND ac.revoked_at < now() - interval '30 days'` → `supabase/migrations/20260926164057_713a9f0a-a5d9-451b-8b34-9b89a991cfc5.sql:35`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:719` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 1640 / `ticketline-crosscheck-daily` | `50 6 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:733` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1646 / `system-reminders-daily` | `30 7 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:747` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1805 / `carreira-youtube-sync-diario` | `5 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:761` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1808 / `carreira-youtube-public-diario` | `0 7 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:775` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1835 / `carreira-s4a-audience-diario` | `45 8 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:789` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1853 / `carreira-song-link-health-diario` | `30 6 * * *` | `song_link_health_run`: `day = p_day;` → `drizzle/migrations/0028_derp185b_song_link_canal_medium.sql:90`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:803` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 1867 / `carreira-tiktok-ads-sync` | `20 7,13,19 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:817` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 1875 / `carreira-soundcharts-sync-referencias-diario` | `30 9 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:831` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2001 / `ticketline-capture-ticket-types-daily` | `30 6 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:845` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2068 / `portal-error-log-retention` | `25 3 * * *` | `purge_portal_error_log`: `created_at < now() - make_interval(days => p_days);` → `drizzle/migrations/0101_0101_derp_243_portal_error_log_backup_retention.sql:9`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:859` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 2155 / `carreira-instagram-stories-1h` | `15 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:873` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2177 / `newgang-club-welcome-5m` | `*/5 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:887` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2189 / `carreira-s4a-daily-sync-2030` | `30 20 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:901` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2190 / `carreira-s4a-audience-diario-2045` | `45 20 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:915` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2193 / `carreira-spotify-charts-2100` | `0 21 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:929` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2197 / `carreira-dbip-city-mensal` | `20 4 3 * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:943` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2234 / `carreira-ads-saldo-12h` | `0 0,12 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:957` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2235 / `carreira-ads-entrega-parada` | `0 13,16,20 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:971` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2256 / `newgang-portal-quente` | `*/4 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:985` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2281 / `newgang-wallet-sync` | `*/10 * * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:999` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2398 / `crm-ingest-lead-captures` | `*/5 * * * *` | `crm_ingest_lead_captures`: `processed = false` → `drizzle/migrations/0266_issue314_fase1_versoes_idade_real.sql:406`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1013` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 2494 / `coala-eb27-audience-sync` | `30 4 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1027` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 2499 / `ng27-clube-audience-sync` | `35 4 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1041` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 4667 / `ugc_watchdog_1400` | `0 14 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1055` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 4668 / `ugc_watchdog_2000` | `0 20 * * *` | `net.http_post`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1069` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 7110 / `artist-ads-refresh-twice-daily` | `0 1,15 * * *` | `get_vault_secret`: `name = _name LIMIT 1;` → `supabase/migrations/20260515132620_375b4d6c-1748-4ba7-8e9b-d29e1667e458.sql:33`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1083` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |
| 7111 / `artist-ads-hourly-retention` | `0 4 * * *` | `sem funções extraídas`; sem predicado recuperável<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1098` | LACUNA: corpo redigido não prova destino/predicado; não certificamos exclusão de treino. |
| 7243 / `song-link-arrivals-hourly-reconcile` | `20 4 * * *` | `song_link_arrivals_hourly_reconcile`: `EXISTS(SELECT 1 FROM public.song_link_events e WHERE e.artist_id=artists.id AND e.event='arrival') UNION ALL SELECT artist_id` → `drizzle/migrations/0229_period_report_exact_hourly.sql:98`<br>Snapshot: `docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json:1110` | LACUNA: função local identificada; cadeia completa e restantes efeitos não certificados. |

Inativos (sem alterar): `coala-sync-regular` (11), `coala-sync-festival` (12), `fever-sync-regular` (13), `fever-sync-festival` (14), `fever-sync-festival-jun` (15), `fever-refresh-token` (23), `crm-meta-sync-creatives` (41), `ticketing-sync-health` (217).

## Complemento dos crons manuais

| Ficheiro | Agenda/destino visível | Estado |
|---|---|---|
| `supabase/manual/cron_carreira_s4a_audience_live.sql:1` | `s4a-audience-sync` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_carreira_song_link_health_live.sql:1` | SQL local; ver corpo | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_carreira_soundcharts_referencias_diario_live.sql:1` | `soundcharts-sync` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_carreira_tiktok_ads_sync_live.sql:1` | `artist-ads-tiktok-sync` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_carreira_youtube_public_live.sql:1` | `artist-song-youtube-public-sync` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_crm_ingest_lead_captures_live.sql:1` | SQL local; ver corpo | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_crm_meta_insights_hourly_live.sql:1` | `crm-meta-sync-insights` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_google_sync_campaigns_live.sql:1` | `crm-google-sync-campaigns` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |
| `supabase/manual/cron_ticketline_crosscheck_live.sql:1` | `ticketline-crosscheck` | Histórico local; não executado. LACUNA de correspondência com o corpo redigido do snapshot. |

## Saídas e tabelas sem company_id

- `notification_log`: origem de envio em supabase/functions/whatsapp-dispatcher/index.ts:169; fila é lida com company_id e guardada antes de sending/POST/log. Callbacks em supabase/functions/whatsapp-webhook/index.ts:108 não são prova geral de inalcançabilidade: LACUNA para outras origens/IDs históricos.
- `capi_*`: `capi-meta-events` chama `capi_guard_lead_dispatch`; `process-leads-capi` chama `process_leads_capi_batch`. 0308 copia a última definição 0164 e acrescenta `NOT is_training_company(l.company_id)` à seleção e uma recusa na guarda final; o contrato externo fica igual. CAPI v2 usa a decisão combinada `marketing_consent_binding_valid` em training-guard.ts: 0308 recusa a empresa de treino antes de validar a prova. Leads e membros passam pela prova do lead selecionado. LACUNA: outras origens CAPI (smart links/Meta/TikTok) não ficam cobertas por esta decisão.
- `club_email_events`: supabase/functions/newgang-email-events/index.ts:20 é um recetor de eventos de email; falta provar a cadeia de todas as origens → LACUNA.
- `vip_coupon_email_log`: supabase/functions/vip-coupon-email/index.ts:122 reserva slot por event_id/email antes do email. O guard transacional bloqueia o envio de treino, mas não impede este registo intermédio → LACUNA.
- `sync_notifications_sent`: drizzle/migrations/0038_0038_derp193_health_recipients_per_company.sql:219 recebe config_id/sync_type; B1 cobre Ticketline/BOL/Fever, mas não Coala/Onebox nem todas as saídas diretas de ticketing-sync-health → LACUNA.

## Push: chamadores encontrados por rg

- `src/lib/push-notifications.ts:120`: sessão de utilizador; origem resolvida do perfil ativo no servidor, sem confiar no body. Empresa real mantém envio e treino recebe 403.
- `supabase/migrations/20260918163626_328d9fc7-2581-42ff-b9a5-16d9851ae9bc.sql:33,54`: `run_operacao_sla_escalator`; frente_team resolve empresa de operacao_frentes e company_admins traz empresa no target. Ambos passam pelo guard antes dos destinatários.
- As versões de 16–19/05 são históricas. `notify_sync_action_needed` foi removida na migração 20260918163626 (linhas 1–5). Não é remetente global atual.
- `GLOBAL_PUSH_SYSTEM_SENDERS=[]`: não foi encontrado um chamador de sistema sem origem empresarial comprovada. Nomes arbitrários no pedido não abrem passagem. LACUNA: quem chame service_role com user_ids sem origem passará a receber 403; provar ausência desses chamadores fora das fontes versionadas antes de promover.

## Últimas definições dos invariantes — prova local

A pesquisa cobriu CREATE FUNCTION em drizzle/migrations, supabase/migrations e baseline/live-only. Ficheiros manuais INERTE não são base. A ordem dos dois históricos é explicitada por fonte; isto não é uma atestação do catálogo Live. O agregador de 0214 é mantido sem mudança e o logger de 20260917222206 também; os delegates resolvem as famílias particionadas.

| Função | Fonte literal / hash do CREATE |
|---|---|
| `_run_invariant_checks_raw_scoped` | `drizzle/migrations/0052_derp_remove_tx_paga_sem_linha_ref_paid_157.sql`; `e85ae91af6fe82375ddaaca9734cf2e798b10ab37be757c5c327cb7ba18412dd` |
| `_run_invariant_checks_extra_scoped` | `drizzle/migrations/0288_reembolso_invariante_corpo_exato_0286_b.sql`; `2d7130bfdc0eafb1ea5ca921e4a52b3f19e1c87a0df5655b0393cda29015ef15` |
| `_run_invariant_checks_duplicate_invoices_scoped` | `drizzle/migrations/0044_derp197_284_invariante_transacao_duplica_fatura.sql`; `209e14dc6dec0a9b04c6ce9e773bb101296e3ca11bf96168b3e69d065958fdd7` |
| `_run_invariant_checks_paid_scoped` | `supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql`; `938965f7e2bdbc62edc83678b4bae51e37eec10256c4e5136680761d7f0a5284` |
| `_run_invariant_checks_infra_scoped` | `supabase/migrations/20260924211456_48f0d3a1-6824-4866-8c88-ef8c9b382ef6.sql`; `e3d3c8c405209ac3418e013559179a11325070a3bcf1470dc46decdeb512a3e8` |
| `_run_invariant_checks_docs_scoped` | `supabase/migrations/20260930190108_5b0ea3f9-dd18-429a-a9ac-b486725c7ad1.sql`; `4771a10ffe67950abc7ec3d2708e56f5e5a88b9e1c9374314c5fe2254845cd95` |
| `_run_invariant_checks_extrato_scoped` | `supabase/baseline/live-only/functions__public._run_invariant_checks_extrato__3722d1156a.sql`; `f52a88a5ccd636000a72893682ef28660556de993e7a5a73c2120a3669bf4c86` |
| `_run_invariant_checks_cards_scoped` | `drizzle/migrations/0026_derp274_invariant_item_duplica_transacao.sql`; `9fe173009fce624f9512f9e079e33cd414b9af8e0b7c0ae3d3724e557b70e85b` |
| `_run_invariant_checks_camarim_scoped` | `drizzle/migrations/0047_derp200_287_camarim_adiantamento_entrada.sql`; `d46d940ced9bb2a1fa80d894f4157ddcf41b252255616be0c1fa384f4a223b6a` |
| `_run_invariant_checks_suppliers_scoped` | `drizzle/migrations/0048_derp201_supplier_similarity_flags.sql`; `90b85ff0d6bb00f3dc7a1a824c51ceb6f3974053321a71859b3361c93200676c` |
| `_run_invariant_checks_paid_below_gross_scoped` | `drizzle/migrations/0049_derp202_285_invariante_pago_abaixo_do_bruto.sql`; `97c1efc1a604849ac1c0a18ffd009a5a98d88b9050e81396351e89ea1149fde4` |
| `_run_invariant_checks_ticketline_series_scoped` | `drizzle/migrations/0061_derp214_ticketline_parallel_series_invariant.sql`; `5317b76a540411605fb92cba94abaeeb05e7f9726623ffbafc06a8821e362a8b` |
| `_run_invariant_checks_unreachable_docs_scoped` | `drizzle/migrations/0062_derp215_invariant_documentos_inalcancaveis.sql`; `a60c79808d188928bf6b0625d06e47f82cdd9890270129d2b0499c2d08d4dc0e` |
| `_run_invariant_checks_storage_scoped` | `drizzle/migrations/0065_derp217_fix_storage_invariant_ambiguous.sql`; `378b43f1a8d99d377c291309ac388cb974b7de8c4032a59a48918606ac67248a` |
| `_run_invariant_checks_rateio_scoped` | `drizzle/migrations/0068_derp219_fix_rateio_invariant_ambiguous.sql`; `2384af6ce6f454b84098eeae122e6fd8aaba7efc126c41c98f77c2d8ffec6e30` |
| `_run_invariant_checks_cash_scoped` | `drizzle/migrations/0089_derp238_invariant_cash_negativo.sql`; `bc2df26e653fc0263960b4b2a63d888cc3ec9bb428bcf8d4470ee9ce679e39d3` |
| `_run_invariant_checks_dre_nature_scoped` | `drizzle/migrations/0096_derp_304_invariant_natureza_divergente.sql`; `c5a9c2b32377d2c114514a68c29468bf6881ec40a1a347994a060625616fef27` |
| `_run_invariant_checks_cache_contracts_scoped` | `drizzle/migrations/0237_cache_attach_advance_to_contract.sql`; `74e8a4b5fddfa0d6ae017abaf1a00f26735bef3af097f8774c4acad3d6e86152` |

**LACUNA #335:** `_extra` conserva para a corrida real as chamadas versionadas `issue335_invariant_counts()` e `issue335_balance_invariant_count()`. Os resultados são globais, sem company_id. Não se pode filtrá-los depois de agregados. A corrida treino omite-os explicitamente. É necessário preparar/aprovar um contrato com âmbito antes de aceitar B3 integralmente; não foi criada uma segunda fórmula para esses saldos.

## Inventário de candidatos de saída (pesquisa por código)

A lista seguinte cobre os entrypoints com chamadas de envio, provedores, filas ou POSTs externos encontrados por pesquisa. O primeiro seletor visível é apenas uma pista verificável: fora dos seis entrypoints alterados, a cadeia completa continua LACUNA até revisão. Uma integração bloqueada só prova B1 se a execução exigir essa configuração; não prova exclusão de uma empresa previamente configurada cuja flag seja alterada.

| Entry point / predicado inicial visível | Cobertura |
|---|---|
| `supabase/functions/apply-coala-bp/index.ts:29`: `.rpc("_supplier_resolve_or_create"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-balance-check/index.ts:133`: `.from("artist_ads_balance_readings")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-balance-probe/index.ts:22`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-budget-update/index.ts:64`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-meta-add-account/index.ts:49`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-meta-create-ig-engagement-audience/index.ts:48`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-meta-interest-search/index.ts:18`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-meta-oauth-callback/index.ts:64`: `.from("oauth_states")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-period-analysis/index.ts:89`: `.rpc("artist_ads_period_report"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-ads-strategy-generate/index.ts:464`: `.from("artists")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-instagram-oauth-callback/index.ts:72`: `.from("artist_channels")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-song-report/index.ts:343`: `.from("artist_song_reports")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-song-youtube-public-sync/index.ts:67`: `.from("artist_channels")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-youtube-oauth-callback/index.ts:40`: `.rpc("crm_consume_oauth_state"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/artist-youtube-sync/index.ts:35`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/audit-categories/index.ts:49`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/audit-invoice-groups/index.ts:41`: `.from('user_roles')` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/auth-email-hook/index.ts:231`: `.from('profiles')` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/capi-meta-events/index.ts:42`: `.rpc("capi_dispatch_allowed"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/capi-v2-send/handler.ts:190`: `.rpc("get_vault_secret"` | B2 antes do envio; fixtures sintéticas nos testes #562. |
| `supabase/functions/classify-coala-tx-with-ai/index.ts:31`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/coala-sync-bootstrap/index.ts:135`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/comparables-tiktok-apify-sync/index.ts:42`: `.from("artist_comparables")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/create-staff/index.ts:43`: `.rpc("has_permission"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/create-user/index.ts:135`: `.from("profiles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-assisted-assembly-narrate/index.ts:135`: `.from("assisted_assembly")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-audience-duel/index.ts:179`: `.from("meta_custom_audiences")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-campaign-design-generate/index.ts:203`: `.from("assisted_assembly")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-cron-pause-replaced-originals/index.ts:71`: `.from("meta_campaign_strategies")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-diag-image-resolution/index.ts:88`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-diag-meta-recommendations/index.ts:64`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-diag-video-source/index.ts:81`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-google-ads-sync/index.ts:275`: `.rpc("is_platform_admin"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-google-sync-campaigns/index.ts:682`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-google-user-list-ensure/index.ts:166`: `.rpc("has_role"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-google-video-metrics-sync/index.ts:298`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audience-blueprints/index.ts:95`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audience-coach/index.ts:101`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audience-create/index.ts:38`: `.from("meta_custom_audiences")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audience-sync/sync-users.ts:43`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audiences-cron-tick/index.ts:18`: `.from("meta_custom_audiences")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-audit-summary/index.ts:103`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-analyze/index.ts:125`: `.from("meta_campaign_snapshot")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-from-scratch/index.ts:201`: `.rpc("current_company_id"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-new-design/index.ts:113`: `.from("meta_campaign_snapshot")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-redesign/index.ts:734`: `.from("audience_duel_runs")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-scale/index.ts:115`: `.from("meta_campaign_snapshot")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-strategy-generate/index.ts:127`: `.from("events")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-campaign-surgical/index.ts:103`: `.from("meta_campaign_snapshot")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-create-lookalike/index.ts:91`: `.from("meta_custom_audiences")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-create-purchase-audience/index.ts:87`: `.from("events")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-create-reels-ad/index.ts:134`: `.from("create_reels_ad_debug")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-create-website-audience/index.ts:97`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-creative-analyze/index.ts:293`: `.from("meta_creatives")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-creatives-recover-hires/index.ts:194`: `.from("meta_creatives")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-deployment-toggle/index.ts:62`: `.from("meta_campaign_strategy_deployments")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-diagnose-ig/index.ts:62`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-entity-action/index.ts:139`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-extract-landing-urls/index.ts:92`: `.from("events")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-fetch-ad-accounts/index.ts:168`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-fetch-pages/index.ts:54`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-funnel-breakdown/index.ts:80`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-funnel-test-run/_browserless.ts:127`: `POST/provedor`<br>`supabase/functions/crm-meta-funnel-test-run/index.ts:123`: `.from("funnel_test_runs")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-interest-search/index.ts:44`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-list-audiences/index.ts:114`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-list-custom-audiences/index.ts:43`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-list-pixels/index.ts:62`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-oauth-callback/index.ts:124`: `.rpc("crm_consume_oauth_state"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-peek-video-ids/index.ts:65`: `.from("ad_platform_account_links")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-pixel-health/index.ts:43`: `.rpc("crm_get_meta_decrypted_token"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-publish-activate/index.ts:105`: `.from("meta_publish_plan")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-publish-execute/index.ts:218`: `.from("meta_publish_plan")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-publish-prepare/index.ts:140`: `.from("meta_publish_plan")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-publish-update/index.ts:164`: `.from("meta_publish_plan")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-recommendations/index.ts:159`: `.from("ad_platform_account_links")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-rehost-images-targeted/index.ts:145`: `.from("meta_creatives")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-rehost-videos/index.ts:106`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-strategy-deploy/index.ts:157`: `.from("meta_campaign_strategy_deployments")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-sync-ads/index.ts:142`: `.from("meta_sync_state")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-sync-adsets/index.ts:134`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-sync-campaigns/index.ts:125`: `.from("meta_sync_state")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-sync-creatives/index.ts:525`: `.from("meta_campaign_snapshot")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-sync-insights/index.ts:375`: `.from("ad_platform_connections")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-upload-creative/index.ts:71`: `.from("upload_creative_debug")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-meta-upload-creative-v2/index.ts:71`: `.from("upload_creative_debug")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-tiktok-oauth-callback/index.ts:42`: `.rpc("crm_tiktok_consume_oauth_state"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-validate-creative-messages/index.ts:156`: `.from("events")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/crm-validate-design-text/index.ts:153`: `.from("assisted_assembly")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/database-restore/index.ts:87`: `.from("database-backups")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/database-restore-v2/index.ts:90`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/dbip-city-sync/index.ts:81`: `.rpc("ip_city_ranges_clear_month"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/extract-camarim-receipt/index.ts:27`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/extract-invoice-total/index.ts:72`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/extract-ticket-pdf/index.ts:166`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/fetch-bol-reports/index.ts:850`: `.rpc("get_vault_secret"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/fetch-fever-reports/index.ts:33`: `.from("fever_sync_runs")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/fetch-onebox-dashboard/index.ts:264`: `.from("onebox_sync_runs")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/fetch-ticketline-reports/index.ts:229`: `.from("ticketline_sync_config")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/generate-accountant-zip/handler.test.ts:75`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/github-issues/index.ts:117`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/google-drive-health/index.ts:32`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/handle-email-suppression/index.ts:87`: `.from('suppressed_emails')` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/help-search/index.ts:68`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/manual-sync/index.ts:121`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/match-categories/index.ts:29`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/newgang-portal/index.ts:31`: `.from("club_points")`<br>`supabase/functions/newgang-portal/wallet-google.ts:155`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/onebox-auth-probe/index.ts:27`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/onebox-probe/index.ts:106`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/portal-track/handler.ts:170`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/process-email-queue/index.ts:125`: `.from('email_send_log')` | B2 antes do envio; fixtures sintéticas nos testes #562. |
| `supabase/functions/process-lead-capture/index.ts:54`: `.rpc("capi_dispatch_allowed"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/process-leads-capi/index.ts:120`: `.rpc("capi_dispatch_allowed"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/process-redirect-log/index.ts:52`: `.rpc("capi_dispatch_allowed"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/refresh-fever-token/index.ts:97`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/request-password-reset/index.ts:238`: `.from("profiles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/resend-reset-email/index.ts:125`: `.rpc("is_platform_admin"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/send-push-notification/index.ts:26`: `.from("operacao_frente_team")` | B2 antes do envio; fixtures sintéticas nos testes #562. |
| `supabase/functions/send-staff-invite/index.ts:33`: `.rpc("has_permission"` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/send-system-reminders/index.ts:33`: `.from("system_reminder_settings")` | B2 antes do envio; fixtures sintéticas nos testes #562. |
| `supabase/functions/send-transactional-email/index.ts:160`: `.from('suppressed_emails')` | B2 antes do envio; fixtures sintéticas nos testes #562. |
| `supabase/functions/song-link-event/enrich-live.test.ts:11`: `POST/provedor`<br>`supabase/functions/song-link-event/index.ts:106`: `.from("ip_geo_cache")`<br>`supabase/functions/song-link-event/ssr-live.test.ts:10`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/soundcharts-sync/index.ts:233`: `.from("artist_channels")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/surgical-restore/index.ts:43`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/sync-coala-from-drive/index.ts:234`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/tests/edge-functions.test.ts:16`: `POST/provedor`<br>`supabase/functions/tests/multi-tenant-edge.test.ts:14`: `POST/provedor`<br>`supabase/functions/tests/transitory-edge.test.ts:16`: `POST/provedor` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/tiktok-artists-probe/index.ts:46`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/tiktok-artists-sync/index.ts:375`: `.from("artist_song_tiktok_groups")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/tiktok-sound-count-sync/index.ts:92`: `.from("artist_song_tiktok_sounds")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/tmp-status-read/index.ts:37`: `.from("user_roles")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/ugc-ios-reading-watchdog/freshness.ts:31`: `.from("email_unsubscribe_tokens")` | LACUNA: rastrear seleção → origem empresarial → efeito externo. |
| `supabase/functions/whatsapp-dispatcher/index.ts:54`: `.rpc("get_vault_secret"` | B2 antes do envio; fixtures sintéticas nos testes #562. |

## Relatórios multiempresa e portal contabilista

- `ReportAccountingExport.tsx`: SELECT das transactions por período/conta; isolamento da leitura depende de RLS. Em treino, nomes TREINO e sem accounting_exports; trigger é reforço no servidor. Documentos individuais também recebem prefixo TREINO.
- `SepaExportModal.tsx`: exercício recebe isTraining; sem payment_list_sepa_exports nem callback onExported/useSepaBankExecution. Trigger resolve payment_lists.company_id. XML é um artefacto com identificador TREINO, mas não existe bloqueio técnico ao upload manual do ficheiro num banco: fonte reservada de identificadores/contas continua pendente para seed.
- `src/pages/contabilidade/AccountantDocumentsTab.tsx` e `supabase/functions/generate-accountant-zip`: filtros por empresa do caller não excluem uma empresa treino selecionada; ZIP e logs do portal ficam fora da lista de edição → LACUNA.
- Não se afirma contaminação monetária comprovada de consolidados. A lista abaixo identifica candidatos sem um predicado explícito company_id/current_company_id no trecho do entrypoint; RLS ou RPC podem fornecer isolamento, mas falta prova. Moedas não foram convertidas nem somadas por esta alteração.

| Candidato (pesquisa por rg/seletores) | Estado |
|---|---|
| `src/components/ReportAccountingExport.tsx:41` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportAccountingExport.tsx:61` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportAccountingExport.tsx:85` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportAccountingExport.tsx:107` — `.from("accounting_exports")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportAccountingExport.tsx:145` — `.from("accounting_exports")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportAging.tsx:32` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportArtistCache.tsx:42` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportArtistCache.tsx:227` — `.from("event_cache_tiers")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportArtistCache.tsx:249` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportArtistCache.tsx:259` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportArtistCache.tsx:263` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:118` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:152` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:174` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:186` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:196` — `.from("partner_paid_expenses")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBPTransactions.tsx:208` — `.from("reimbursement_note_items")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBankStatement.tsx:60` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBankStatement.tsx:78` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBankStatement.tsx:131` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBankStatement.tsx:245` — `.from("bank_line_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBudgetDeviation.tsx:32` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBudgetDeviation.tsx:46` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBudgetDeviation.tsx:57` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportBudgetDeviation.tsx:72` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportCashFlow.tsx:86` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportCashFlow.tsx:121` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportContasPagar.tsx:60` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportContasPagar.tsx:72` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:317` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:328` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:339` — `.from("event_settlements")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:354` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:372` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:389` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:398` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:410` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:419` — `.from("event_partners")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:432` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:449` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:461` — `.from("event_ab_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDRE.tsx:469` — `.from("event_ab_config")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:270` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:281` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:293` — `.from("event_settlements")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:306` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:324` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:333` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:342` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:354` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:363` — `.from("event_partners")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:373` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREBrasil.tsx:390` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:74` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:85` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:94` — `.from("event_settlements")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:111` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:129` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:138` — `.from("event_partners")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:147` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:156` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDREEmpresarial.tsx:169` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDailySales.tsx:85` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDailySales.tsx:117` — `.rpc("get_daily_sales_series"` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDocumentPendencies.tsx:33` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDocumentPendencies.tsx:42` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDocumentPendencies.tsx:55` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportDocumentPendencies.tsx:78` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:74` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:106` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:115` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:128` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:137` — `.from("event_cache_configs")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:146` — `.from("event_cache_deductions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportForecastPayables.tsx:155` — `.from("event_cache_tiers")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaAudit.tsx:35` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaAudit.tsx:45` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaAudit.tsx:59` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaRateCoherence.tsx:41` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaRateCoherence.tsx:56` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportIvaRateCoherence.tsx:133` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMonthlyEvolution.tsx:31` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:42` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:51` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:60` — `.from("suppliers")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:73` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:98` — `.from("transaction_audit_log")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportMovementReconciliation.tsx:123` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportOccupancyRate.tsx:22` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportOccupancyRate.tsx:31` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportOccupancyRate.tsx:37` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:586` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:597` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:617` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:626` — `.from("event_settlements")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:639` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:648` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:657` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:669` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:678` — `.from("event_cache_configs")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:687` — `.from("event_cache_deductions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:696` — `.from("event_cache_extras")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPL.tsx:706` — `.from("forecast_audit_log")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerExpenses.tsx:24` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerExpenses.tsx:36` — `.from("partner_paid_expenses")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:26` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:38` — `.from("partner_paid_expenses")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:50` — `.from("partner_advance_expenses")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:60` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:70` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:82` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:89` — `.from("event_ticket_lots")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPartnerSettlement.tsx:100` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPendencyIndex.tsx:22` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPendencyIndex.tsx:34` — `.from("transaction_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportPendencyIndex.tsx:45` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:36` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:49` — `.from("venues")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:59` — `.from("event_cache_configs")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:70` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:81` — `.from("event_settlements")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportProfitability.tsx:98` — `.from("event_forecasts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportRevenueMix.tsx:36` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportRevenueMix.tsx:49` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportRevenueMix.tsx:60` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportSalesComparison.tsx:25` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportSalesComparison.tsx:43` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportSalesCurve.tsx:19` — `.from("events")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportSalesCurve.tsx:35` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportSupplierConcentration.tsx:24` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:104` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:119` — `.from("event_ticket_office_assignments")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:131` — `.from("event_ticket_zones")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:153` — `.from("ticket_sales")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:176` — `.rpc("get_ticket_office_sales"` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:205` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTicketOfficeAudit.tsx:220` — `.from("event_ticket_office_advances")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTreasuryProjection.tsx:29` — `.from("financial_accounts")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/components/ReportTreasuryProjection.tsx:65` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/ReportAccountCategoriesPage.tsx:14` — `.from("account_categories")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/ReportSuppliersPage.tsx:22` — `.from("suppliers")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/ReportSuppliersPage.tsx:36` — `.from("transactions")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantDocumentsTab.tsx:182` — `.from("profiles")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantDocumentsTab.tsx:259` — `.rpc("record_document_download"` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantDocumentsTab.tsx:461` — `.rpc("record_document_download"` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:158` — `.from("standalone_invoices")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:162` — `.from("standalone-invoices")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:250` — `.from("profiles")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:262` — `.from("standalone_invoices")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:278` — `.from("standalone_invoices")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/AccountantSuppliersTab.tsx:63` — `.from("supplier_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/SupplierViewModal.tsx:58` — `.from("supplier_documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/SupplierViewModal.tsx:72` — `.from("supplier-documents")` | LACUNA: auditar RLS/RPC e consolidação com treino. |
| `src/pages/contabilidade/SupplierViewModal.tsx:75` — `.rpc("record_document_download"` | LACUNA: auditar RLS/RPC e consolidação com treino. |

## Provas e limites de promoção

- As provas PGlite usam somente fixtures sintéticas e o manual 0308 completo; não consultam Live. As funções auxiliares financeiras dos testes são stubs determinísticos: a prova é do âmbito, não uma validação dos motores financeiros existentes.
- SHA-256 do DOM real do seletor (capturado antes): `7401f2377806af9879fb4af8f2d4063ea8da90738920d05f3b741028d7d7ae15`; XML real: `f9faeae50f64509027ea188a9268efe99cdfc34b96ffbe209e17a4aee2a4e4c3`.
- Colisões preexistentes: 0303 (#338/#498), 0304 (#450/#498), 0305 (#486/#498). Não renumeradas; journal/meta intocados. 0308 não foi registada no journal nem aplicada.
- Mudanças concorrentes da flag, configurações preexistentes e trabalhos já em voo exigem uma janela com produtores parados **apenas para a empresa de treino** e prova transacional. Os guards de leitura não são um lease atómico que acompanhe um POST externo → LACUNA; nenhum automatismo real foi desligado.
- Os produtores de recorrentes/listas/aprovações, backups multiempresa, artist/report syncs, audiências, Wallet e outras saídas fora da lista fechada não ganharam filtros por treino. Lacunas acima impedem declarar isolamento universal e devolver autorização de seed ao chat 10.
- `prova-isolamento.sql` é roteiro inerte para uma janela autorizada, com as mutações comentadas; não foi executado.

- A publicação das edges depende da 0308 aprovada e verificada primeiro: sem RPC/coluna disponíveis, o guard recusa o envio em vez de assumir empresa real. Preparação em ficheiro não autoriza essa publicação nem interromper alertas reais.
- `tabelas_acima_de_1000` mantém o controlo estrutural original por reltuples: a estatística inclui linhas de treino e pode atravessar o limiar → LACUNA na promessa absoluta de alertas sem treino.

## Pesquisa reproduzível no checkout

```sh
rg -n 'send-push-notification' src supabase --glob '*.ts' --glob '*.tsx' --glob '*.sql'
rg -n '\.from\(|\.rpc\(|platform_admin|current_company_id|company_id' src/pages/contabilidade src/components/Report*.tsx supabase/functions/generate-accountant-zip
rg -n '_run_invariant_checks_|pg_get_functiondef' drizzle/migrations supabase/migrations supabase/baseline/live-only --glob '*.sql'
```

As substituições dinâmicas de 0051, 0074 e 0097 também foram conferidas: as bases completas posteriores 0052/0288 já incorporam esses trechos. A lista de hashes não usa candidatos manuais INERTE como catálogo.
