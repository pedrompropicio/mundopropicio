-- #299: o invariante tabelas_acima_de_1000 comparava só a CONTAGEM (43 vs ref 28) e a amostra
-- mostrava as 6 maiores (já vigiadas), por isso o alerta diário nunca nomeava a tabela em falta.
-- Passa a contar as tabelas >1000 linhas que NÃO estão na lista vigiada (espelho de
-- src/lib/postgrest-large-tables.json), referência 0, amostra = as tabelas em falta.
-- WATCHED_TABLES_BEGIN
-- 'transactions','ticket_sales','event_forecasts','transaction_documents','event_zone_capacities','bilheteira_zone_snapshots','leads','contacts','undo_actions','meta_audience_upload_members','meta_custom_audiences','user_activity_log','system_audit_log','transaction_audit_log','ticketline_sync_runs','bol_sync_runs','coala_sync_runs','fever_sync_runs','transaction_payments','bank_statement_lines','artist_content_metrics_daily','song_link_events','redirect_log','consent_log','google_click','meta_ad_insights_daily','artist_metrics_daily','song_link_diag','meta_ad_snapshot','tickets_v2_sync_log','ads_insights_breakdown_daily','meta_adset_insights_daily','meta_creatives','artist_audience_demographics','meta_creatives_retention_log','lead_capture','email_send_log','artist_content','artist_song_metrics_daily','meta_adset_snapshot','email_unsubscribe_tokens','portal_error_log','meta_campaign_insights_daily','artist_song_playlist_streams','event_forecast_formalidade_log','artist_release_metrics_daily','ip_geo_cache'
-- WATCHED_TABLES_END
DO $mig$
DECLARE d text; old_block text; new_block text;
BEGIN
  d := pg_get_functiondef('public._run_invariant_checks_extra'::regproc);
  old_block := $o$       AND c.reltuples > 1000
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 6) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;$o$;
  new_block := $n$       AND c.reltuples > 1000
       AND c.relname <> ALL (ARRAY['transactions','ticket_sales','event_forecasts','transaction_documents','event_zone_capacities','bilheteira_zone_snapshots','leads','contacts','undo_actions','meta_audience_upload_members','meta_custom_audiences','user_activity_log','system_audit_log','transaction_audit_log','ticketline_sync_runs','bol_sync_runs','coala_sync_runs','fever_sync_runs','transaction_payments','bank_statement_lines','artist_content_metrics_daily','song_link_events','redirect_log','consent_log','google_click','meta_ad_insights_daily','artist_metrics_daily','song_link_diag','meta_ad_snapshot','tickets_v2_sync_log','ads_insights_breakdown_daily','meta_adset_insights_daily','meta_creatives','artist_audience_demographics','meta_creatives_retention_log','lead_capture','email_send_log','artist_content','artist_song_metrics_daily','meta_adset_snapshot','email_unsubscribe_tokens','portal_error_log','meta_campaign_insights_daily','artist_song_playlist_streams','event_forecast_formalidade_log','artist_release_metrics_daily','ip_geo_cache']::text[])
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 50) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;$n$;
  IF position(old_block in d) = 0 THEN
    RAISE EXCEPTION '#299: bloco tabelas_acima_de_1000 não encontrado';
  END IF;
  EXECUTE replace(d, old_block, new_block);
END
$mig$;

UPDATE public.system_invariants
   SET reference_count = 0,
       description = 'Tabelas (public/crm) com mais de 1.000 linhas que NÃO estão na lista vigiada pela barreira dos 1.000 (src/lib/postgrest-large-tables.json). A amostra nomeia-as.',
       notes = '10/10/2026 (#299): passou de contagem total (ref 28) para comparação por nome; ref 0. Ao acusar uma tabela: acrescentá-la ao JSON e ao array da função (teste postgrest-large-tables-mirror).',
       updated_at = now()
 WHERE name = 'tabelas_acima_de_1000';