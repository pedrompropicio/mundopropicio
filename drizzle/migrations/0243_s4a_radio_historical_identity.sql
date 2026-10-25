CREATE OR REPLACE VIEW public.artist_song_playlist_daily WITH (security_invoker=true) AS
WITH RECURSIVE normalized AS (SELECT t.*,CASE WHEN made_by='spotify' AND (playlist_uri='spotify:playlist:radio' OR (playlist_uri IS NULL AND lower(trim(playlist_name))='radio')) THEN 'spotify:playlist:radio' ELSE playlist_key END stable_key FROM public.artist_song_playlist_streams t), keys AS (
 SELECT p.company_id,p.artist_id,p.song_id,p.stable_key playlist_key,s.release_date,min(p.snapshot_date) FILTER(WHERE p.period_days=1) first_real,max(p.snapshot_date) last_day
 FROM normalized p JOIN public.artist_songs s ON s.id=p.song_id AND s.company_id=p.company_id WHERE p.source='s4a_api' AND p.period_days IN(1,28) AND s.release_date IS NOT NULL GROUP BY 1,2,3,4,5
), series AS (
 SELECT k.*,k.release_date-1 AS day,ARRAY[]::numeric[] counts,0::numeric streams_day,false estimated FROM keys k
 UNION ALL
 SELECT a.company_id,a.artist_id,a.song_id,a.playlist_key,a.release_date,a.first_real,a.last_day,a.day+1,a.counts || ARRAY[v.val],v.val,(r.snapshot_date IS NULL AND (a.first_real IS NULL OR a.day+1<a.first_real))
 FROM series a
 LEFT JOIN normalized r ON r.company_id=a.company_id AND r.artist_id=a.artist_id AND r.song_id=a.song_id AND r.stable_key=a.playlist_key AND r.snapshot_date=a.day+1 AND r.period_days=1 AND r.source='s4a_api'
 LEFT JOIN normalized w ON w.company_id=a.company_id AND w.artist_id=a.artist_id AND w.song_id=a.song_id AND w.stable_key=a.playlist_key AND w.snapshot_date=a.day+1 AND w.period_days=28 AND w.source='s4a_api'
 LEFT JOIN normalized prev ON prev.company_id=a.company_id AND prev.artist_id=a.artist_id AND prev.song_id=a.song_id AND prev.stable_key=a.playlist_key AND prev.snapshot_date=a.day AND prev.period_days=28 AND prev.source='s4a_api'
 CROSS JOIN LATERAL (SELECT CASE WHEN r.snapshot_date IS NOT NULL THEN r.streams::numeric WHEN a.first_real IS NOT NULL AND a.day+1>=a.first_real THEN NULL WHEN w.streams IS NULL OR (a.day>=a.release_date AND prev.streams IS NULL) THEN NULL ELSE w.streams-coalesce(prev.streams,0)+CASE WHEN a.day+1-28<a.release_date THEN 0 ELSE a.counts[(a.day+1-28)-a.release_date+1] END END raw) x
 CROSS JOIN LATERAL (SELECT CASE WHEN x.raw>=0 THEN x.raw END val) v WHERE a.day<a.last_day
)
SELECT a.company_id,a.artist_id,a.song_id,a.playlist_key,a.day,a.streams_day,a.estimated,a.first_real,p.playlist_name,p.playlist_uri,p.made_by,
 coalesce(p.playlist_kind,CASE WHEN p.made_by='user' THEN 'listener' WHEN p.made_by='spotify' AND (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name)) IN('radio','mixes','descobertas da semana','radar de novidades') OR lower(trim(p.playlist_name)) ~ '^daily mix( [0-9]+)?$') THEN 'algorithmic' END) playlist_kind,
 CASE WHEN p.made_by='spotify' AND (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio') THEN 'radio' ELSE 'other' END category
FROM series a JOIN LATERAL (SELECT q.* FROM normalized q WHERE q.company_id=a.company_id AND q.artist_id=a.artist_id AND q.song_id=a.song_id AND q.stable_key=a.playlist_key AND q.source='s4a_api' AND q.snapshot_date<=a.day ORDER BY q.snapshot_date DESC,q.period_days ASC LIMIT 1) p ON true WHERE a.day>=a.release_date;