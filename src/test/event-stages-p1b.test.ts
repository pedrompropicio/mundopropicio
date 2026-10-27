// @vitest-environment node
// P1b (D-ERP319): sub-event stage follows the master; stage RPCs refuse sub-events; checklist aggregates sub-event blockers.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
let db:PGlite;
const m='10000000-0000-0000-0000-000000000001', k='10000000-0000-0000-0000-000000000002', c='7c858982-6ccd-47ca-bd65-e0dd3eebf01c', u='20000000-0000-0000-0000-000000000001';
const one=async(sql:string)=>(await db.query<{v:any}>(sql)).rows[0]?.v;
const stage=(id:string)=>one(`select event_stage('${id}') v`);
const empty='{"hard":{"camarim_sessions":[],"card_sessions":[],"circuit_accounts":[]},"soft":{"bp_lines_unreviewed":{"count":0,"saldo_net":0}}}';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${u}'::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
 CREATE TYPE app_role AS ENUM ('admin','manager');
 CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${c}'::uuid$$;
 CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=current_company_id()$$;
 CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION has_permission_in(uuid,text,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE events(id uuid PRIMARY KEY,name text,date date,status text,company_id uuid,parent_event_id uuid);
 CREATE TABLE event_settlements(id uuid,event_id uuid,company_id uuid,is_sealed boolean,sealed_snapshot jsonb);
 CREATE TABLE event_cache_configs(id uuid,event_id uuid,company_id uuid,is_finalized boolean);
 CREATE TABLE event_cache_city_settlements(cache_config_id uuid,event_id uuid,is_finalized boolean);
 CREATE TABLE system_audit_log(entity_type text,entity_id text,action text,changed_by text,company_id uuid,metadata jsonb);
 CREATE TABLE blockers(event_id uuid,v jsonb);
 CREATE FUNCTION event_close_blockers(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce((SELECT v FROM blockers WHERE event_id=$1),'${empty}'::jsonb)$$;`);
 await db.exec(readFileSync('supabase/manual/0280_p1_event_stages.sql','utf8'));
 await db.exec(readFileSync('supabase/manual/0281_p1b_substage_follows_master.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{await db.exec(`BEGIN;INSERT INTO events VALUES('${m}','master','2000-01-01','completed','${c}',null,null,null,null,null),('${k}','sub','2099-01-01','active','${c}','${m}',null,null,null,null);`)});
afterEach(async()=>{await db.exec('ROLLBACK')});
it('sub-event stage equals the master stage, ignoring its own status',async()=>{
 expect(await stage(m)).toBe('em_fecho'); expect(await stage(k)).toBe('em_fecho');
 await db.exec(`UPDATE events SET status='planning' WHERE id='${m}'`); expect(await stage(k)).toBe('planeamento');
});
it('sub-event created under a closed master is fechado',async()=>{
 await db.exec(`DELETE FROM events WHERE id='${k}'`);
 await db.exec(`SELECT close_event('${m}','t')`);
 await db.exec(`INSERT INTO events(id,name,date,status,company_id,parent_event_id) VALUES('${k}','new','2099-01-01','active','${c}','${m}')`);
 expect(await stage(k)).toBe('fechado');
});
it('sub-event own stamps are ignored',async()=>{
 await db.exec(`SELECT set_config('app.event_stage_op','${k}:'||txid_current()::text,true); UPDATE events SET historical_at=now() WHERE id='${k}'; SELECT set_config('app.event_stage_op','',true)`);
 expect(await stage(k)).toBe('em_fecho');
});
it('stage RPCs on a sub-event are refused pointing to the master',async()=>{
 for(const q of [`close_event('${k}','t')`,`mark_event_historical('${k}','t')`,`reopen_event_closure('${k}','t')`,`unmark_event_historical('${k}')`])
  {await db.exec('SAVEPOINT s');await expect(db.exec(`SELECT ${q}`)).rejects.toThrow(`event_stage_act_on_master: ${m}`);await db.exec('ROLLBACK TO SAVEPOINT s');}
});
it('master checklist aggregates hard and soft blockers of sub-events',async()=>{
 await db.exec(`INSERT INTO blockers VALUES('${k}','{"hard":{"camarim_sessions":[{"id":"s1"}],"card_sessions":[],"circuit_accounts":[{"id":"a"}]},"soft":{"bp_lines_unreviewed":{"count":2,"saldo_net":10.5}}}'),
  ('${m}','{"hard":{"camarim_sessions":[],"card_sessions":[],"circuit_accounts":[{"id":"a"}]},"soft":{"bp_lines_unreviewed":{"count":1,"saldo_net":1}}}')`);
 const v=await one(`select event_close_checklist('${m}') v`);
 expect(v.ok).toBe(false); expect(v.hard_blockers.count).toBe(2); expect(v.bp_lines).toMatchObject({count:3,saldo_net:11.5});
 await expect(db.exec(`SELECT close_event('${m}')`)).rejects.toThrow('event_close_checklist_failed');
});
