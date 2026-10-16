-- #328 — snapshot dos dados imediatamente antes de carregar o patch.
\set ON_ERROR_STOP 1
DO $$ BEGIN
  INSERT INTO it.kv VALUES
    ('points_sum', (SELECT coalesce(sum(points),0)::text FROM club_points)),
    ('points_n', (SELECT count(*)::text FROM club_points)),
    ('members_n', (SELECT count(*)::text FROM club_members)),
    ('members_hash', (SELECT md5(string_agg(id::text||coalesce(email,'')||coalesce(phone,'')||coalesce(referred_by_member_id::text,'')||coalesce(pending_crew_code,''), ',' ORDER BY id)) FROM club_members));
END $$;
