-- Credential-free local fixture only; never run against ERP/Cloud.
-- Run after /tmp local stubs and the hourly-arrivals migration.
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO artists(id) VALUES('00000000-0000-0000-0000-000000000001');
INSERT INTO song_links(id,canal) VALUES('00000000-0000-0000-0000-000000000002','meta_ads');
INSERT INTO song_link_events(id,company_id,artist_id,link_id,event,created_at,os)
VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','arrival','2026-10-18 12:13:00+00','Android');
DO $$ BEGIN
 IF (SELECT n FROM song_link_arrivals_hourly)<>1 THEN RAISE EXCEPTION 'INSERT must add exactly one'; END IF;
 IF NOT EXISTS(SELECT 1 FROM song_link_arrivals_hourly WHERE hour_utc='2026-10-18 12:00+00' AND country='?' AND os='android') THEN RAISE EXCEPTION 'UTC/country/OS normalization'; END IF;
END $$;
UPDATE song_link_events SET country='BR',os='ios',utm_source='teste_unit' WHERE id='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_arrivals_hourly)<>1 THEN RAISE EXCEPTION 'move must preserve count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM song_link_arrivals_hourly WHERE canal='teste' AND country='BR' AND os='ios' AND n=1) THEN RAISE EXCEPTION 'test channel must be retained'; END IF;
END $$;
UPDATE song_link_events SET event='choice' WHERE id='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_arrivals_hourly)<>0 THEN RAISE EXCEPTION 'arrival to choice must subtract one'; END IF;
END $$;
UPDATE song_link_events SET event='arrival' WHERE id='00000000-0000-0000-0000-000000000003';
DELETE FROM song_link_events WHERE id='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_arrivals_hourly)<>0 THEN RAISE EXCEPTION 'DELETE must subtract exactly one'; END IF;
 IF has_table_privilege('authenticated','public.song_link_arrivals_hourly','SELECT') THEN RAISE EXCEPTION 'authenticated direct access forbidden'; END IF;
END $$;
-- A missing old dimension must not fail the source update; both buckets are repairable.
INSERT INTO song_link_events(id,company_id,artist_id,link_id,event,created_at,os)
VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','arrival','2026-10-18 12:13+00','android');
DELETE FROM song_link_arrivals_hourly WHERE artist_id='00000000-0000-0000-0000-000000000001';
UPDATE song_link_events SET country='PT' WHERE id='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM song_link_events WHERE country='PT') THEN RAISE EXCEPTION 'capture must survive aggregate error'; END IF;
 IF (SELECT count(*) FROM song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL)<>2 THEN RAISE EXCEPTION 'both failed dimensions must be marked'; END IF;
END $$;
SELECT song_link_arrivals_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 13:00+00');
DO $$ BEGIN
 IF (SELECT sum(n) FROM song_link_arrivals_hourly)<>1 THEN RAISE EXCEPTION 'rebuild must restore exact source count'; END IF;
 IF EXISTS(SELECT 1 FROM song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL) THEN RAISE EXCEPTION 'visible pending IDs must be repaired'; END IF;
 IF (song_link_arrivals_hourly_rebuild('00000000-0000-0000-0000-000000000001','2026-10-18 12:00+00','2026-10-18 13:00+00')->>'divergent_rows')::bigint<>0 THEN RAISE EXCEPTION 'second rebuild must have zero divergence'; END IF;
END $$;
ROLLBACK;