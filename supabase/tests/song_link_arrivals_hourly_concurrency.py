"""Local-only test, no credentials. Requires local stubs and hourly migration.
Run with PGHOST pointing to a /tmp socket, never against Cloud.
"""
import os
import subprocess
import time

assert os.environ.get("PGHOST", "").startswith("/tmp/"), "local database only"


def sql(query):
    result = subprocess.run(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
                            check=True, capture_output=True, text=True)
    return result.stdout.strip()


A = "00000000-0000-0000-0000-000000000001"
H = "2026-10-18 12:00+00"
sql(f"INSERT INTO artists VALUES('{A}');")
lock = subprocess.Popen(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c",
    f"BEGIN; SELECT pg_advisory_xact_lock(song_link_arrivals_hour_key('{A}','{H}')); SELECT pg_sleep(1.5); COMMIT;"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(0.3)
start = time.monotonic()
sql(f"INSERT INTO song_link_events(company_id,artist_id,event,created_at) VALUES('{A}','{A}','arrival','{H}');")
assert time.monotonic() - start < 1, "capture waited for maintenance"
assert sql("SELECT count(*) FROM song_link_events") == "1"
assert sql("SELECT count(*) FROM song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL") == "1"
lock.communicate(timeout=5)
assert lock.returncode == 0
sql(f"SET request.jwt.claim.role='service_role'; SELECT song_link_arrivals_hourly_rebuild('{A}','{H}','2026-10-18 13:00+00');")
assert sql("SELECT sum(n) FROM song_link_arrivals_hourly") == "1"
assert sql("SELECT count(*) FROM song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL") == "0"
sql(f"DELETE FROM song_link_events WHERE artist_id='{A}'; DELETE FROM song_link_arrivals_hourly WHERE artist_id='{A}'; DELETE FROM song_link_arrivals_hourly_log WHERE artist_id='{A}'; DELETE FROM artists WHERE id='{A}';")
print("PASS: contended capture retained without waiting; pending hour repaired exactly")