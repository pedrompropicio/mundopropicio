-- D-ERP176 — aplicado em Live a 06/10/2026 (jobid 1853); crons não propagam com Publish.
SELECT cron.schedule('carreira-song-link-health-diario','30 6 * * *',$$select public.song_link_health_run();$$);
