-- Local-only fixtures. Never execute against Cloud/ERP.
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO artists(id) VALUES('00000000-0000-0000-0000-000000000001');
INSERT INTO song_links(id,canal) VALUES('00000000-0000-0000-0000-000000000002','meta_ads');
INSERT INTO song_link_events(company_id,artist_id,link_id,event,created_at,country,utm_source,utm_campaign,ip_hash)
SELECT '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000002','arrival',h,c,'meta','campaign-a','visitor-1'
FROM (VALUES ('2026-10-18 12:10+00'::timestamptz,'BR'),('2026-10-18 13:10+00','BR'),('2026-10-18 14:10+00','PT')) x(h,c);
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_report_hourly)<>3 THEN RAISE EXCEPTION '3 arrivals required'; END IF;
 IF (SELECT count(*) FROM (SELECT DISTINCT hour_utc::date,dim->>0,dim->>1,dim->>3 FROM song_link_report_visitors_hourly WHERE kind='campaign' AND n>0) x)<>1 THEN RAISE EXCEPTION 'one campaign visitor across hours/countries'; END IF;
 IF (SELECT count(*) FROM (SELECT DISTINCT hour_utc::date,dim->>0,dim->>2 FROM song_link_report_visitors_hourly WHERE kind='channel' AND n>0) x)<>1 THEN RAISE EXCEPTION 'one channel visitor across hours/countries'; END IF;
END $$;
UPDATE song_link_events SET ip_hash='visitor-2' WHERE country='PT';
DO $$ BEGIN
 IF (SELECT count(*) FROM (SELECT DISTINCT hour_utc::date,dim->>0,dim->>2 FROM song_link_report_visitors_hourly WHERE kind='channel' AND n>0) x)<>2 THEN RAISE EXCEPTION 'identity change must produce two visitors'; END IF;
END $$;
UPDATE song_link_events SET utm_campaign='campaign-b' WHERE country='PT';
UPDATE song_link_events SET utm_source='teste_unit' WHERE country='PT';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM song_link_report_hourly WHERE dim->>5='teste' AND n=1) THEN RAISE EXCEPTION 'test channel retained'; END IF;
END $$;
DELETE FROM song_link_events WHERE country='PT';
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_report_hourly)<>2 THEN RAISE EXCEPTION 'delete subtracts one'; END IF;
END $$;
SELECT song_link_report_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 15:00+00');
DO $$ BEGIN
 IF (song_link_report_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 15:00+00')->>'divergent_rows')::bigint<>0 THEN RAISE EXCEPTION 'rebuild must be idempotent'; END IF;
 IF has_table_privilege('authenticated','public.song_link_report_visitors_hourly','SELECT') THEN RAISE EXCEPTION 'private membership'; END IF;
END $$;
UPDATE song_links SET canal='instagram_bio';
DO $$ BEGIN
 IF (SELECT count(*) FROM song_link_report_hourly_log WHERE kind='pending' AND repaired_at IS NULL)<>2 THEN RAISE EXCEPTION 'link changes mark both active hours'; END IF;
END $$;
SELECT song_link_report_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 15:00+00');
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_report_hourly WHERE dim->>5='instagram_bio')<>2 THEN RAISE EXCEPTION 'channel repair preserves 2 arrivals'; END IF;
END $$;
-- The prior eight were two count removals/additions and two visitor removals/additions.
-- Show the idempotent result explicitly, not just inside an assertion.
SELECT song_link_report_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 15:00+00') AS final_reconciliation;
INSERT INTO song_link_events(company_id,artist_id,link_id,event,created_at,country,ip_hash)
SELECT '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000002','arrival',h,NULL,NULL
FROM (VALUES ('2026-10-18 12:15+00'::timestamptz),('2026-10-18 13:15+00')) x(h);
DO $$ BEGIN
 -- Legacy 0228 counts DISTINCT tuple rows, including one NULL identity per day/key.
 IF (SELECT count(*) FROM (SELECT DISTINCT hour_utc::date,dim->>0,dim->>2 FROM song_link_report_visitors_hourly WHERE kind='channel' AND n>0) x)<>2 THEN RAISE EXCEPTION 'NULL identity must match legacy tuple DISTINCT'; END IF;
 IF (SELECT sum(v) FROM song_link_report_visitor_totals_daily WHERE kind='channel' AND scope='all')<>2 THEN RAISE EXCEPTION 'daily total deduplicates NULL and cross-hour visitors'; END IF;
 IF (SELECT sum(n) FROM song_link_report_visitor_refs_daily WHERE kind='channel' AND scope='all')<>4 THEN RAISE EXCEPTION 'daily references retain all four arrivals'; END IF;
END $$;
SELECT song_link_report_hourly_validate('00000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 IF NOT (SELECT ready FROM song_link_report_hourly_state LIMIT 1) THEN RAISE EXCEPTION 'complete validated aggregate must become ready'; END IF;
 IF (SELECT sum(n) FROM song_link_report_arrivals('00000000-0000-0000-0000-000000000001','2026-10-18','2026-10-18',NULL) WHERE kind='channel')<>4 THEN RAISE EXCEPTION 'ready reader returns four arrivals'; END IF;
END $$;
UPDATE song_link_report_hourly_state SET ready=false;
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_report_arrivals('00000000-0000-0000-0000-000000000001','2026-10-18','2026-10-18',NULL) WHERE kind='channel')<>4 THEN RAISE EXCEPTION 'unready reader falls back to source'; END IF;
END $$;
ROLLBACK;