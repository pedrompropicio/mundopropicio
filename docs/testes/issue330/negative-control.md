# Output integral local — #330

```text
runtime: postgres (PostgreSQL) 17.9 · socket local (sem TCP) · 2026-10-16T22:38:48Z
listen_addresses=
psql:/dev-server/drizzle/migrations/0119_0119_newgang_lineup_reveals_security.sql:2: NOTICE:  policy "event_lineups_authenticated_all" for relation "public.event_lineups" does not exist, skipping
                      ?column?                       
-----------------------------------------------------
 LEGADO_OK 54/12597/266a4ff7faa845b7b7eef309ddd40d9e
(1 row)

psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_points_config_select_staff" for relation "public.club_points_config" does not exist, skipping
psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_level_floors_select_staff" for relation "public.club_level_floors" does not exist, skipping
psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_points_cutover_log_select_staff" for relation "public.club_points_cutover_log" does not exist, skipping
psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_legacy_consumption_select_staff" for relation "public.club_legacy_consumption" does not exist, skipping
psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_referral_events_select_staff" for relation "public.club_referral_events" does not exist, skipping
psql:/dev-server/supabase/manual/20261016_issue327.PENDENTE.sql:169: NOTICE:  policy "club_purchase_evidence_select_staff" for relation "public.club_purchase_evidence" does not exist, skipping
psql:/dev-server/scripts/club-sql-it/05_egress.sql:26: NOTICE:  EGRESS_OK: net.http_post indisponível (3F000)
psql:/dev-server/scripts/club-sql-it/05_egress.sql:26: NOTICE:  EGRESS_OK: dblink não instalável (0A000)
                                                                                                                                                                                                                                                                                                                                                                                                                                                           club_points_cutover                                                                                                                                                                                                                                                                                                                                                                                                                                                            
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 {"floors": 6, "members": 29, "legacy_rows": 35, "rules_after": {"attended_year": {"active": true, "points": 100}, "crew_complete": {"active": true, "points": 100}, "friend_bought": {"active": true, "points": 300}, "friend_joined": {"active": true, "points": 75}, "guess_correct": {"active": true, "points": 50}, "join_confirmed": {"active": true, "points": 100}, "promo_lot_purchase": {"active": true, "points": 200}}, "levels_after": {"Crew": 750, "Gang": 0, "Goat": 3000}, "rules_before": {"attended_year": {"active": true, "points": 100}, "crew_complete": {"active": true, "points": 200}, "friend_bought": {"active": true, "points": 300}, "friend_joined": {"active": true, "points": 150}, "guess_correct": {"active": true, "points": 50}, "join_confirmed": {"active": true, "points": 100}, "promo_lot_purchase": {"active": true, "points": 500}}, "levels_before": {"Crew": 500, "Gang": 0, "Goat": 1500}}
(1 row)

             session              
----------------------------------
 cdf88dce54f1653dfdb9ff02f7d38142
(1 row)

             session              
----------------------------------
 288145e9b1bc635eb79ba328293cfa50
(1 row)

 ok 
----
 
(1 row)

 reject 
--------
 
(1 row)

 club_profile_configure 
------------------------
 
(1 row)

 ok 
----
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 reject 
--------
 
(1 row)

 ok 
----
 
(1 row)

psql:/dev-server/scripts/club-profile-it/scenario.sql:42: ERROR:  profile_credit_failed
CONTEXT:  PL/pgSQL function club_profile_confirm(uuid,text,jsonb) line 42 at RAISE

```
