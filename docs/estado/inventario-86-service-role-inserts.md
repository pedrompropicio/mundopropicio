# Inventário #86 — INSERTs service_role sem company_id explícito
Gerado: 2026-09-14

Análise estática de `supabase/functions/*/index.ts` (exclui `_shared`) à procura de
`.insert(` / `.upsert(` nas 88 tabelas com o trigger `trg_set_company_id`
(`set_company_id_on_insert`). Sob `service_role` o `auth.uid()` é NULL, logo o trigger
não consegue resolver `company_id` — tem de vir explícito no payload, retirado da linha
auditada ou de um parâmetro do pedido (nunca de `auth.uid()` nem `current_company_id()`).

## Resumo
- Edge functions analisadas: 191
- Escritas encontradas nas 88 tabelas: 78 (em 29 funções)
- RISCO real: 1 (`check-login-rate` → `system_audit_log`)
- RISCO condicional: 2 (`selective-restore`, `database-restore-v2` — INSERT genérico `insertRows`)
- OK (company_id explícito no payload literal): 44
- OK após inspecção manual (payload em variável, company_id construído antes): 30
- Já corrigidos a 01/09 e excluídos das contagens de risco: `transaction_audit_log` em `approve-transaction` e `update-transaction`; `ticket_sales` em `selective-restore` e `surgical-restore`

## RISCO — necessitam correção

### check-login-rate
- Tabela: `system_audit_log`
- Linha aprox.: 281
- Snippet: `.from("system_audit_log").insert({ entity_type: "security", entity_id: ip, action: "security_alert_sent", changed_by: "system", metadata: { target_email, ... } })`
- Motivo: `company_id` não passado — o ficheiro inteiro não tem uma única referência a `company_id`. O fluxo é de login (IP + email), corre sob `service_role` e não recebe empresa no pedido.
- Decisão pendente: (a) resolver `company_id` pelo perfil do email alvo (pode ser NULL em email inexistente/multi-empresa), ou (b) aceitar eventos de segurança sem empresa (coluna opcional para `entity_type='security'`). Nenhuma das duas é código puro — envolve DDL ou regra nova.

## RISCO CONDICIONAL — restauros com INSERT genérico

### selective-restore
- Tabelas: várias das 88 (restauro por tabela/evento)
- Snippet: helper `insertRows(table, rows)` → `.from(table).upsert(rows, { onConflict: "id" })`
- Motivo: o payload não passa `company_id` explícito. Na prática as linhas vêm do backup e são filtradas por `tenantFilter` (`row.company_id === tenantFilter`) antes do INSERT, pelo que o `company_id` já viaja dentro de cada linha. Fica como condicional: se algum backup antigo tiver linhas sem `company_id`, o INSERT passa a depender do trigger e falha.
- `ticket_sales` nesta função foi corrigido a 01/09.

### database-restore-v2
- Tabelas: várias das 88 (restauro completo)
- Snippet: mesmo padrão `insertRows` com `upsert` por `id`
- Motivo: idem — `company_id` só existe porque vem no backup, não por ser passado explicitamente.

## OK após inspecção manual — payload em variável com company_id construído antes

### ads-invoice-apply
- Tabela: `transactions` — linha ~518 — `insert({ ...base, event_id: null, amount: total, invoice_ref: inv.invoice_number, spli…`
- Tabela: `transactions` — linha ~535 — `insert({ ...base, event_id: eventId, amount: subtotal, parent_transaction_id: parent.i…`
- Origem do company_id: `base` inclui `company_id: inv.company_id` (construído antes do INSERT)

### approve-transaction
- Tabela: `transaction_audit_log` — linha ~381 — `insert(auditEntries)…`
- Tabela: `transaction_audit_log` — linha ~419 — `insert(raiseAudit as any)…`
- Tabela: `transaction_audit_log` — linha ~448 — `insert(childAuditEntries)…`
- Origem do company_id: payloads em variáveis `auditEntries` / `raiseAudit` / `childAuditEntries`, todos com `company_id: transaction.company_id` (já corrigido a 01/09)

### artist-instagram-sync
- Tabela: `artist_metrics_daily` — linha ~373 — `upsert(metricRows, { onConflict: "artist_id,platform,metric,metric_date,source", })…`
- Tabela: `artist_audience_demographics` — linha ~382 — `upsert(demoRows, { onConflict: "artist_id,platform,audience_type,dimension,dim_key,sna…`
- Tabela: `artist_content` — linha ~392 — `upsert(contentRows, { onConflict: "artist_id,platform,external_id" })…`
- Tabela: `artist_content_metrics_daily` — linha ~436 — `upsert(cmRows, { onConflict: "content_id,metric,metric_date,source" })…`
- Origem do company_id: linhas construídas com `company_id: conn.company_id`

### artist-shorts-sync
- Tabela: `artist_content` — linha ~365 — `upsert(batch.slice(i, i + 300), { onConflict: "artist_id,platform,external_id", })…`
- Tabela: `artist_content_metrics_daily` — linha ~413 — `upsert(metricRows.slice(i, i + 500), { onConflict: "content_id,metric,metric_date,sour…`
- Origem do company_id: linhas construídas com `company_id: conn.company_id`

### artist-tiktok-oauth-callback
- Tabela: `artist_metrics_daily` — linha ~149 — `upsert(metricRows, { onConflict: "artist_id,platform,metric,metric_date,source" })…`
- Origem do company_id: linhas construídas com `company_id` do estado OAuth

### artist-tiktok-sync
- Tabela: `artist_metrics_daily` — linha ~310 — `upsert(metricRows, { onConflict: "artist_id,platform,metric,metric_date,source", })…`
- Tabela: `artist_content` — linha ~320 — `upsert(contentRows, { onConflict: "artist_id,platform,external_id" })…`
- Tabela: `artist_content_metrics_daily` — linha ~356 — `upsert(cmRows, { onConflict: "content_id,metric,metric_date,source" })…`
- Origem do company_id: linhas construídas com `company_id: conn.company_id`

### close-camarim-session
- Tabela: `transactions` — linha ~665 — `insert(txPayload)…`
- Tabela: `transaction_documents` — linha ~752 — `insert(dossierRows)…`
- Tabela: `transactions` — linha ~853 — `insert(bankLeg)…`
- Tabela: `transactions` — linha ~859 — `insert(camarimLeg)…`
- Tabela: `transaction_audit_log` — linha ~893 — `insert(auditRows)…`
- Origem do company_id: `txPayload` / `dossierRows` / `bankLeg` / `camarimLeg` / `auditRows` levam `company_id: sessionCompanyId`

### close-card-session
- Tabela: `transactions` — linha ~609 — `insert(txPayload)…`
- Tabela: `transaction_documents` — linha ~690 — `insert(rows)…`
- Tabela: `transaction_audit_log` — linha ~808 — `insert(auditRows)…`
- Origem do company_id: `txPayload` / `rows` / `auditRows` levam `company_id` da sessão

### song-soundcharts-sync
- Tabela: `artist_song_metrics_daily` — linha ~232 — `upsert(rows.slice(i, i + 500), { onConflict: "song_id,platform,metric,metric_date,sour…`
- Tabela: `artist_song_playlists` — linha ~286 — `upsert(upserts, { onConflict: "song_id,platform,playlist_uuid" })…`
- Origem do company_id: linhas construídas com `company_id` da música/artista

### soundcharts-sync
- Tabela: `artist_metrics_daily` — linha ~512 — `upsert(chunk, { onConflict: "artist_id,platform,metric,metric_date,source", })…`
- Origem do company_id: chunks construídos com `company_id` do artista

### suamusica-sync
- Tabela: `artist_metrics_daily` — linha ~314 — `upsert(metricRows, { onConflict: "artist_id,platform,metric,metric_date,source", })…`
- Tabela: `artist_release_metrics_daily` — linha ~467 — `upsert(relRows, { onConflict: "release_id,metric,metric_date,source" })…`
- Origem do company_id: linhas construídas com `company_id` da ligação

### surgical-restore
- Tabela: `event_ticket_lots` — linha ~166 — `upsert(batch, { onConflict: "id" })…`
- Tabela: `ticket_sales` — linha ~190 — `upsert(batch, { onConflict: "id" })…`
- Tabela: `ticket_import_logs` — linha ~202 — `upsert(backupImportLogs, { onConflict: "id" })…`
- Origem do company_id: `batch` vem do backup e já traz `company_id`; `ticket_sales` já corrigido a 01/09

### update-transaction
- Tabela: `transaction_audit_log` — linha ~395 — `insert(auditEntries)…`
- Tabela: `transaction_audit_log` — linha ~548 — `insert(auditOnSiblings)…`
- Origem do company_id: `auditEntries` / `auditOnSiblings` com `company_id` da transação (já corrigido a 01/09)

## OK — company_id passado explicitamente no payload

### accept-invitation
- Tabela: `user_roles` (linha ~90) — company_id vem de: `invite.company_id`

### accept-staff-invite
- Tabela: `user_roles` (linha ~56) — company_id vem de: `invite.company_id`

### ads-invoice-apply
- Tabela: `transaction_documents` (linha ~557) — company_id vem de: `inv.company_id`
- Tabela: `transaction_documents` (linha ~591) — company_id vem de: `inv.company_id`

### apply-coala-bp
- Tabela: `suppliers` (linha ~988) — company_id vem de: `ev.company_id`
- Tabela: `event_forecasts` (linha ~1083) — company_id vem de: `ev.company_id`
- Tabela: `transactions` (linha ~1198) — company_id vem de: `ev.company_id`
- Tabela: `partner_paid_expenses` (linha ~1213) — company_id vem de: `ev.company_id`
- Tabela: `event_forecasts` (linha ~1290) — company_id vem de: `ev.company_id`
- Tabela: `suppliers` (linha ~1682) — company_id vem de: `ev.company_id`
- Tabela: `event_forecasts` (linha ~1882) — company_id vem de: `ev.company_id`
- Tabela: `transactions` (linha ~1899) — company_id vem de: `ev.company_id`
- Tabela: `transactions` (linha ~1911) — company_id vem de: `ev.company_id`
- Tabela: `transactions` (linha ~1922) — company_id vem de: `ev.company_id`
- Tabela: `suppliers` (linha ~2091) — company_id vem de: `ev.company_id`
- Tabela: `transactions` (linha ~2174) — company_id vem de: `ev.company_id`
- Tabela: `event_forecasts` (linha ~2197) — company_id vem de: `ev.company_id`

### approve-transaction
- Tabela: `forecast_audit_log` (linha ~345) — company_id vem de: `lineById.get(e.forecast_id)?.company_id`

### artist-comparable-manage
- Tabela: `artists` (linha ~218) — company_id vem de: `artist.company_id`
- Tabela: `artist_channels` (linha ~234) — company_id vem de: `artist.company_id`
- Tabela: `artist_comparables` (linha ~278) — company_id vem de: `artist.company_id`

### artist-instagram-oauth-start
- Tabela: `artist_oauth_states` (linha ~86) — company_id vem de: `channel.company_id`

### artist-meta-oauth-start
- Tabela: `artist_oauth_states` (linha ~80) — company_id vem de: `channel.company_id`

### artist-song-manage
- Tabela: `artist_songs` (linha ~190) — company_id vem de: `artist.company_id`

### artist-tiktok-oauth-start
- Tabela: `artist_oauth_states` (linha ~82) — company_id vem de: `channel.company_id`

### close-camarim-session
- Tabela: `forecast_audit_log` (linha ~390) — company_id vem de: `(fcFull as any)?.company_id`
- Tabela: `transaction_documents` (linha ~695) — company_id vem de: `sessionCompanyId`
- Tabela: `camarim_integrations` (linha ~959) — company_id vem de: `sessionCompanyId`

### close-card-session
- Tabela: `forecast_audit_log` (linha ~503) — company_id vem de: `r.company_id ?? sessionCompanyId`
- Tabela: `transaction_audit_log` (linha ~525) — company_id vem de: `sessionCompanyId`
- Tabela: `transaction_documents` (linha ~639) — company_id vem de: `sessionCompanyId`
- Tabela: `transactions` (linha ~772) — company_id vem de: `company_id no payload`

### create-user
- Tabela: `user_roles` (linha ~156) — company_id vem de: `companyId`
- Tabela: `user_roles` (linha ~299) — company_id vem de: `callerCompanyId`

### fetch-bol-reports
- Tabela: `financial_accounts` (linha ~1017) — company_id vem de: `cfg.company_id`

### invite-company-admin
- Tabela: `company_invitations` (linha ~85) — company_id vem de: `body.company_id`

### onboarding-bulk-import
- Tabela: `user_roles` (linha ~114) — company_id vem de: `company_id no payload`
- Tabela: `user_roles` (linha ~154) — company_id vem de: `company_id no payload`

### partner-statement
- Tabela: `system_audit_log` (linha ~169) — company_id vem de: `companyId`

### soundcharts-reference-songs
- Tabela: `artist_songs` (linha ~179) — company_id vem de: `artist.company_id`

### suamusica-sync
- Tabela: `artist_releases` (linha ~420) — company_id vem de: `artist.company_id`

### test-multi-tenant-isolation
- Tabela: `suppliers` (linha ~71) — company_id vem de: `co1.id`
- Tabela: `suppliers` (linha ~76) — company_id vem de: `co2.id`
- Tabela: `suppliers` (linha ~105) — company_id vem de: `co2.id`

## Sem INSERTs relevantes

As restantes 162 edge functions não escrevem em nenhuma das 88 tabelas
(CRM/Meta/Google escrevem no schema `crm`; sincronizações, OCR, e-mail, webhooks, leitura pura):

`ads-invoice-ingest`, `artist-ads-disconnect`, `artist-ads-meta-oauth-callback`, `artist-ads-meta-oauth-start`, `artist-ads-select-account`, `artist-connection-disconnect`, `artist-instagram-oauth-callback`, `artist-meta-oauth-callback`, `artist-song-report`, `artist-token-refresh`, `audit-categories`, `audit-invoice-groups`, `auth-email-hook`, `bilheteira-sync`, `capi-meta-events`, `classify-coala-tx-with-ai`, `coala-sync-bootstrap`, `create-company`, `create-staff`, `crm-assisted-assembly-compute`, `crm-assisted-assembly-narrate`, `crm-audience-duel`, `crm-audience-duel-status`, `crm-campaign-brief`, `crm-campaign-design-generate`, `crm-campaign-diagnosis`, `crm-cron-pause-replaced-originals`, `crm-diag-image-resolution`, `crm-diag-meta-recommendations`, `crm-diag-video-source`, `crm-extract-video-dimensions`, `crm-google-ads-sync`, `crm-google-click-ingest`, `crm-google-conversion-upload`, `crm-google-customer-match-sync`, `crm-google-lead-conversion-enqueue`, `crm-google-publish-activate`, `crm-google-publish-execute`, `crm-google-publish-lookups`, `crm-google-sync-campaigns`, `crm-google-user-list-ensure`, `crm-measure-action-impact`, `crm-meta-audience-blueprints`, `crm-meta-audience-coach`, `crm-meta-audience-create`, `crm-meta-audience-sync`, `crm-meta-audience-upload`, `crm-meta-audiences-cron-tick`, `crm-meta-audit-summary`, `crm-meta-campaign-analyze`, `crm-meta-campaign-from-scratch`, `crm-meta-campaign-new-design`, `crm-meta-campaign-redesign`, `crm-meta-campaign-scale`, `crm-meta-campaign-strategy-generate`, `crm-meta-campaign-surgical`, `crm-meta-create-lookalike`, `crm-meta-create-purchase-audience`, `crm-meta-create-reels-ad`, `crm-meta-create-website-audience`, `crm-meta-creative-analyze`, `crm-meta-creatives-recover-hires`, `crm-meta-creatives-rehost`, `crm-meta-deployment-toggle`, `crm-meta-destilar-2025`, `crm-meta-diagnose-ig`, `crm-meta-entity-action`, `crm-meta-extract-landing-urls`, `crm-meta-fetch-ad-accounts`, `crm-meta-fetch-pages`, `crm-meta-fq-recon`, `crm-meta-funnel-breakdown`, `crm-meta-funnel-test-run`, `crm-meta-funnel-test-status`, `crm-meta-historico-probe`, `crm-meta-interest-search`, `crm-meta-landing-audit`, `crm-meta-list-audiences`, `crm-meta-list-custom-audiences`, `crm-meta-list-pixels`, `crm-meta-oauth-callback`, `crm-meta-peek-video-ids`, `crm-meta-pixel-health`, `crm-meta-publish-activate`, `crm-meta-publish-execute`, `crm-meta-publish-prepare`, `crm-meta-recommendations`, `crm-meta-recon-2025`, `crm-meta-redesign-inventory`, `crm-meta-rehost-images-targeted`, `crm-meta-rehost-videos`, `crm-meta-strategy-deploy`, `crm-meta-sync-ads`, `crm-meta-sync-adsets`, `crm-meta-sync-campaigns`, `crm-meta-sync-creatives`, `crm-meta-sync-insights`, `crm-meta-upload-creative`, `crm-meta-upload-creative-v2`, `crm-validate-creative-messages`, `crm-validate-design-text`, `database-backup`, `database-restore`, `database-restore-v2`, `debug-key-check`, `delete-user`, `extract-camarim-receipt`, `extract-invoice-total`, `extract-ticket-pdf`, `fetch-fever-reports`, `fetch-fx-rate`, `fetch-ticketline-reports`, `fever-ingest-browser`, `generate-accountant-zip`, `geo-lookup`, `github-issues`, `google-drive-health`, `handle-email-suppression`, `handle-email-unsubscribe`, `help-search`, `match-categories`, `migrate-legacy-images`, `migrate-portal-event-images`, `migrate-press-clippings`, `onboarding-complete`, `onboarding-preview`, `onebox-auth-probe`, `onebox-probe`, `parse-coala-bp`, `portal-media-import`, `preview-transactional-email`, `probe-fever-login`, `process-email-queue`, `process-lead-capture`, `process-leads-capi`, `process-redirect-log`, `refresh-fever-token`, `request-password-reset`, `resend-reset-email`, `resolve-attachment-url`, `resolve-operacao-media-url`, `restore-debug`, `run-rls-legacy-audit`, `selective-restore`, `send-push-notification`, `send-staff-invite`, `send-system-reminders`, `send-transactional-email`, `sepa-compact-descriptions`, `soundcharts-artist-search`, `soundcharts-artist-similar`, `soundcharts-song-search`, `sync-coala-from-drive`, `tests`, `tmp-fever-reimport`, `update-bol-credentials`, `update-fever-b2b-token`, `update-fever-credentials`, `update-ticketline-credentials`, `vip-coupon-email`, `whatsapp-dispatcher`, `whatsapp-webhook`
