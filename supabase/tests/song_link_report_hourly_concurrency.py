"""Credential-free local PostgreSQL test; never run against Cloud."""
import os
import subprocess
import time

assert os.environ.get('PGHOST', '').startswith('/tmp/'), 'local only'

def sql(q):
    return subprocess.run(['psql','-X','-At','-v','ON_ERROR_STOP=1','-c',q],check=True,capture_output=True,text=True).stdout.strip()

a='00000000-0000-0000-0000-000000000001'
h='2026-10-18 12:00+00'
sql(f"INSERT INTO artists VALUES('{a}');")
lock=subprocess.Popen(['psql','-X','-At','-c',f"BEGIN; SELECT pg_advisory_xact_lock(song_link_arrivals_hour_key('{a}','{h}')); SELECT pg_sleep(1.5); COMMIT;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
time.sleep(0.3)
t=time.monotonic()
sql(f"INSERT INTO song_link_events(company_id,artist_id,event,created_at) VALUES('{a}','{a}','arrival','{h}');")
assert time.monotonic()-t<1,'capture must not wait'
assert sql("SELECT count(*) FROM song_link_events")=='1'
assert sql("SELECT count(*) FROM song_link_report_hourly_log WHERE kind='pending' AND repaired_at IS NULL")=='1'
lock.communicate(timeout=5)
assert lock.returncode==0
sql(f"SET request.jwt.claim.role='service_role'; SELECT song_link_report_hourly_rebuild('{a}','{h}','2026-10-18 13:00+00');")
assert sql("SELECT sum(n) FROM song_link_report_hourly")=='1'
assert sql("SELECT count(*) FROM song_link_report_hourly_log WHERE kind='pending' AND repaired_at IS NULL")=='0'
print(sql(f"SET request.jwt.claim.role='service_role'; SELECT song_link_report_hourly_rebuild('{a}','{h}','2026-10-18 13:00+00');"))
print('PASS: capture concurrent with hourly lock retained; pending repaired; exact NULL identity retained')
sql(f"DELETE FROM song_link_events WHERE artist_id='{a}'; DELETE FROM song_link_report_hourly WHERE artist_id='{a}'; DELETE FROM song_link_report_visitors_hourly WHERE artist_id='{a}'; DELETE FROM song_link_report_hourly_log WHERE artist_id='{a}'; DELETE FROM song_link_arrivals_hourly WHERE artist_id='{a}'; DELETE FROM song_link_arrivals_hourly_log WHERE artist_id='{a}'; DELETE FROM artists WHERE id='{a}';")