\set ON_ERROR_STOP 1
CREATE FUNCTION t.cityck(n text,b boolean) RETURNS void LANGUAGE sql AS $$ SELECT t.ok('332city',n,b) $$;
SELECT t.cityck('308 official codes',(SELECT count(*)=308 FROM portugal_municipalities));
SELECT t.cityck('278 mainland 19 Azores 11 Madeira',(SELECT count(*) FILTER(WHERE region='Continente')=278 AND count(*) FILTER(WHERE region='Açores')=19 AND count(*) FILTER(WHERE region='Madeira')=11 FROM portugal_municipalities));
SELECT t.cityck('case accents spaces exact',club_city_normalize('PT','  S A N T A R E M ')='Santarém');
SELECT t.cityck('unicode decomposed',club_city_normalize('PT',U&'Santare\0301m')='Santarém');
SELECT t.cityck('foreign text capitalized',club_city_normalize('BR','  SÃO   paulo ')='São Paulo');
SELECT t.cityck('foreign city not forced PT',club_city_normalize('BR','lISBOA')='Lisboa');
SELECT t.cityck('Lagoa repeated name retained both codes',(SELECT count(*)=2 FROM portugal_municipalities WHERE name='Lagoa'));
DO $$ BEGIN
 BEGIN PERFORM club_city_normalize('PT','Lisboa Centro'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'city_unknown' THEN RAISE; END IF; END;
 PERFORM t.cityck('unknown not fuzzy',true);
 BEGIN PERFORM club_city_normalize('PT','<script>'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'city_invalid' THEN RAISE; END IF; END;
 PERFORM t.cityck('invalid input rejected',true);
END $$;
SELECT t.cityck('public list only 308 codes',jsonb_array_length(club_cities()->'cities')=308 AND club_cities()->>'version'='caop-2025');
CREATE TABLE t.city_points AS SELECT id,points,ref_id FROM club_points;
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"city":"Caacais"}','city_unknown');
SELECT t.cityck('invalid confirm no award changes',(SELECT count(*)=0 FROM ((SELECT id,points,ref_id FROM club_points EXCEPT SELECT * FROM t.city_points) UNION ALL (SELECT * FROM t.city_points EXCEPT SELECT id,points,ref_id FROM club_points)) z));
SELECT t.cityck('existing completion no additional award',(t.call(md5('profile@example.invalid'),t.payload()||'{"city":" s E i x a l "}')->>'awarded')::int=0);
SELECT t.cityck('RPC reads canonical stored city',t.state(md5('profile@example.invalid'))->>'city'='Seixal');
SELECT t.cityck('foreign RPC reads normalized',(t.call(md5('profile@example.invalid'),t.payload()||'{"residence_country":"BR","city":"  são   paulo"}')#>>'{profile,city}')='São Paulo');
SELECT t.call(md5('profile@example.invalid'),t.payload()||'{"city":"lisboa"}');
DO $$ BEGIN
 BEGIN UPDATE club_member_profiles SET city='Tomae' WHERE member_id=t.m('profile@example.invalid'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'city_unknown' THEN RAISE; END IF; END;
 PERFORM t.cityck('direct profile writer guarded',true);
END $$;
ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS raw jsonb;
INSERT INTO companies(id,name) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','MP fixture');
INSERT INTO lead_capture(id,company_id,source,email,raw) VALUES('33200000-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','city@example.invalid','{"city":"Santarem","residence_country":"PT"}');
SELECT t.cityck('capture canonical on insertion',(SELECT raw->>'city'='Santarém' FROM lead_capture WHERE id='33200000-0000-4000-8000-000000000001'));
INSERT INTO lead_capture(company_id,source,email,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','foreign@example.invalid','{"city":"são   paulo","residence_country":"BR"}');
SELECT t.cityck('foreign capture preserved normalized',(SELECT raw->>'city'='São Paulo' FROM lead_capture WHERE email='foreign@example.invalid'));
DO $$ BEGIN
 BEGIN INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"city":"Caacais","residence_country":"PT"}'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'city_unknown' THEN RAISE; END IF; END;
 PERFORM t.cityck('unknown capture rejected atomically',true);
END $$;
UPDATE lead_capture SET raw=raw||'{"other":"preserved"}' WHERE id='33200000-0000-4000-8000-000000000001';
SELECT t.cityck('capture metadata unchanged',(SELECT raw->>'other'='preserved' FROM lead_capture WHERE id='33200000-0000-4000-8000-000000000001'));
INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','other','{"city":"Caacais"}');
SELECT t.cityck('non Club capture unaffected',(SELECT raw->>'city'='Caacais' FROM lead_capture WHERE source='other'));
INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"city":"lisBOA"}');
SELECT t.cityck('foreign city without country stays free',(SELECT raw->>'city'='Lisboa' FROM lead_capture WHERE raw->>'city'='Lisboa'));
SELECT t.cityck('anon reference read not mutate',has_table_privilege('anon','portugal_municipalities','SELECT') AND NOT has_table_privilege('anon','portugal_municipalities','UPDATE') AND NOT has_table_privilege('service_role','portugal_municipalities','INSERT'));
SELECT t.cityck('session RPC ACL retained',NOT has_function_privilege('anon','club_profile_confirm(uuid,text,jsonb)','EXECUTE') AND has_function_privilege('service_role','club_profile_confirm(uuid,text,jsonb)','EXECUTE'));

ALTER TABLE lead_capture DISABLE TRIGGER club332_city_capture;
INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"city":" santarem "}'),('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"city":"SANTARÉM"}'),('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"city":"Caacais"}');
ALTER TABLE lead_capture ENABLE TRIGGER club332_city_capture;
SET it.company='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
SELECT t.cityck('historical summary three spellings one municipality',(SELECT (x->>'n')::int=3 FROM jsonb_array_elements(clube_newgang_summary()->'by_city') x WHERE x->>'k'='Santarém'));
SELECT t.cityck('historical list canonical without rewriting',(SELECT count(*)=3 FROM clube_newgang_list(NULL,1000,0) WHERE city='Santarém'));
SELECT t.cityck('unknown historic left unchanged',(SELECT raw->>'city'='Caacais' FROM lead_capture WHERE raw->>'city'='Caacais' AND source='clube_newgang'));
CREATE TABLE t.backfill_before AS SELECT id,raw FROM lead_capture;
\i supabase/manual/20261017_issue332_city.BACKFILL.PENDENTE.sql
CREATE TABLE t.backfill_once AS SELECT id,raw FROM lead_capture;
\i supabase/manual/20261017_issue332_city.BACKFILL.PENDENTE.sql
SELECT t.cityck('backfill idempotent',(SELECT count(*)=0 FROM ((SELECT id,raw FROM lead_capture EXCEPT SELECT * FROM t.backfill_once) UNION ALL (SELECT * FROM t.backfill_once EXCEPT SELECT id,raw FROM lead_capture)) z));
SELECT t.cityck('backfill does not infer country',(SELECT bool_and(l.raw->>'residence_country' IS NOT DISTINCT FROM b.raw->>'residence_country') FROM lead_capture l JOIN t.backfill_before b USING(id)));
DO $$ BEGIN
 BEGIN
 UPDATE lead_capture SET source='other',raw='{"city":"Caacais","residence_country":"PT"}' WHERE source='clube_newgang' AND raw->>'city'='Caacais';
 RAISE EXCEPTION 'guard bypass accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'city_unknown' THEN RAISE; END IF; END;
 PERFORM t.cityck('scope transition cannot bypass city guard',true);
END $$;
SELECT t.cityck('points unchanged by city and backfill',(SELECT count(*)=0 FROM ((SELECT id,points,ref_id FROM club_points EXCEPT SELECT * FROM t.city_points) UNION ALL (SELECT * FROM t.city_points EXCEPT SELECT id,points,ref_id FROM club_points)) z));

SELECT t.cityck('foreign no country no city normalizes empty',club_city_normalize(NULL,NULL) IS NULL);
SELECT t.cityck('foreign named country empty city accepted',club_city_normalize('BR','') IS NULL);
SELECT t.cityck('foreign arbitrary city without country free',club_city_normalize(NULL,'  metropolis   abroad ')= 'Metropolis Abroad');
SELECT t.cityck('foreign profile absent city complete',(t.call(md5('profile@example.invalid'),(t.payload()-'city')||'{"residence_country":"BR"}')#>>'{profile,complete}')::boolean);
SELECT t.cityck('foreign profile absent country and city complete',(t.call(md5('profile@example.invalid'),t.payload()-'city'-'residence_country')#>>'{profile,complete}')::boolean);
SELECT t.cityck('foreign optional does not award again',(t.call(md5('profile@example.invalid'),t.payload()-'city'-'residence_country')->>'awarded')::int=0);
SELECT t.reject(md5('profile@example.invalid'),t.payload()-'city','city_invalid');
INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{}'),('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"residence_country":"BR","city":""}');
SELECT t.cityck('foreign captures absent country city preserved',EXISTS(SELECT 1 FROM lead_capture WHERE source='clube_newgang' AND raw='{}'::jsonb));
DO $$ BEGIN
 BEGIN INSERT INTO lead_capture(company_id,source,raw) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube_newgang','{"residence_country":"PT"}'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'city_invalid' THEN RAISE; END IF; END;
 PERFORM t.cityck('PT capture city mandatory',true);
END $$;
SELECT t.call(md5('profile@example.invalid'),t.payload()||'{"city":"Lisboa"}');
