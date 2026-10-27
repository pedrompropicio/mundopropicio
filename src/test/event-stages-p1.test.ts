// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
let db:PGlite;
const id='10000000-0000-0000-0000-000000000001', child='10000000-0000-0000-0000-000000000002', c='7c858982-6ccd-47ca-bd65-e0dd3eebf01c', u='20000000-0000-0000-0000-000000000001';
async function stage(){return (await db.query<{v:string}>(`select event_stage('${id}') v`)).rows[0]?.v;}
async function checks(){return (await db.query<{v:any}>(`select event_close_checklist('${id}') v`)).rows[0]?.v;}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${u}'::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
 CREATE TYPE app_role AS ENUM ('admin','manager');
 CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${c}'::uuid$$;
 CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=current_company_id()$$;
 CREATE TABLE actor(role text,permission boolean); INSERT INTO actor VALUES('admin',true);
 CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT role=$2::text FROM actor$$;
 CREATE FUNCTION has_permission_in(uuid,text,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT permission FROM actor$$;
 CREATE TABLE events(id uuid PRIMARY KEY,name text,date date,status text,company_id uuid,parent_event_id uuid);
 CREATE TABLE event_settlements(id uuid,event_id uuid,company_id uuid,is_sealed boolean,sealed_snapshot jsonb);
 CREATE TABLE event_cache_configs(id uuid,event_id uuid,company_id uuid,is_finalized boolean);
 CREATE TABLE event_cache_city_settlements(cache_config_id uuid,event_id uuid,is_finalized boolean);
 CREATE TABLE system_audit_log(entity_type text,entity_id text,action text,changed_by text,company_id uuid,metadata jsonb);
 CREATE TABLE blockers(v jsonb); INSERT INTO blockers VALUES('{"hard":{"camarim_sessions":[],"card_sessions":[],"circuit_accounts":[]},"soft":{"bp_lines_unreviewed":{"count":0,"saldo_net":0}}}');
 CREATE FUNCTION event_close_blockers(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT v FROM blockers$$;`);
 await db.exec(readFileSync('supabase/manual/0280_p1_event_stages.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{await db.exec(`BEGIN;INSERT INTO events VALUES('${id}','test','2099-01-01','active','${c}',null,null,null,null,null);`)});
afterEach(async()=>{await db.exec('ROLLBACK')});
it('planning, active future, completed and cancelled are exact stages',async()=>{
 expect(await stage()).toBe('em_curso');
 for(const [s,v] of [['planning','planeamento'],['completed','em_fecho'],['cancelled','cancelado']]){await db.exec(`UPDATE events SET status='${s}' WHERE id='${id}'`);expect(await stage()).toBe(v)}
});
it('strict local date uses last own/child date, including today',async()=>{
 await db.exec(`UPDATE events SET date='2000-01-01' WHERE id='${id}'`);expect(await stage()).toBe('em_fecho');
 await db.exec(`INSERT INTO events(id,name,date,status,company_id,parent_event_id) VALUES('${child}','child',(now() AT TIME ZONE 'Europe/Lisbon')::date,'active','${c}','${id}')`);expect(await stage()).toBe('em_curso');
});
it('direct updates and inserted stamps are refused',async()=>{
 await expect(db.exec(`UPDATE events SET closed_at=now() WHERE id='${id}'`)).rejects.toThrow('event_stage_direct_write_forbidden');
});
it('empty checklist has concrete zero values',async()=>{expect(await checks()).toMatchObject({ok:true,settlements:{total:0},cache:{configured_targets:0},bp_lines:{count:0},hard_blockers:{count:0}})});
it('unsealed settlement or missing snapshot prevents closure',async()=>{
 await db.exec(`INSERT INTO event_settlements VALUES('${child}','${id}','${c}',false,null)`);expect((await checks()).ok).toBe(false);
 await db.exec(`UPDATE event_settlements SET is_sealed=true`);expect((await checks()).ok).toBe(false);
 await db.exec(`UPDATE event_settlements SET sealed_snapshot='{}'`);expect((await checks()).ok).toBe(true);
});
it('configured cache requires freeze and city override wins',async()=>{
 await db.exec(`INSERT INTO event_cache_configs VALUES('${child}','${id}','${c}',false)`);expect((await checks()).cache.unfrozen).toBe(1);
 await db.exec(`INSERT INTO event_cache_city_settlements VALUES('${child}','${id}',true)`);expect((await checks()).cache.unfrozen).toBe(0);
});
it('BP review and every hard blocker prohibit closure',async()=>{
 await db.exec(`UPDATE blockers SET v=jsonb_set(v,'{soft,bp_lines_unreviewed,count}','1')`);expect((await checks()).ok).toBe(false);
 await db.exec(`UPDATE blockers SET v=jsonb_set(jsonb_set(v,'{soft,bp_lines_unreviewed,count}','0'),'{hard,circuit_accounts}','[{"id":"c"}]')`);expect((await checks()).hard_blockers.count).toBe(1);
 await expect(db.exec(`SELECT close_event('${id}')`)).rejects.toThrow('event_close_checklist_failed');
});
it('close stamps and audit, repeat refused; legacy reopen clears both stamps',async()=>{
 await db.exec(`SELECT close_event('${id}','local test')`);expect(await stage()).toBe('fechado');
 expect((await db.query(`SELECT action,metadata->>'reason' reason FROM system_audit_log`)).rows[0]).toMatchObject({action:'event_closed',reason:'local test'});
 await db.exec('SAVEPOINT repeated');await expect(db.exec(`SELECT close_event('${id}')`)).rejects.toThrow('event_already_closed');await db.exec('ROLLBACK TO repeated');
 await db.exec(`UPDATE events SET status='active' WHERE id='${id}'`);expect(await stage()).toBe('em_curso');expect((await db.query(`SELECT closed_at,closed_by FROM events WHERE id='${id}'`)).rows[0]).toEqual({closed_at:null,closed_by:null});
});
it('reopen closure requires reason and permission, does not change completed',async()=>{
 await db.exec(`SELECT close_event('${id}')`);
 await db.exec(`SELECT reopen_event_closure('${id}','reason')`);expect(await stage()).toBe('em_fecho');
});
it('historical mark/unmark leaves status intact',async()=>{
 await db.exec(`SELECT mark_event_historical('${id}','reason')`);expect(await stage()).toBe('historico');
 await db.exec(`SELECT unmark_event_historical('${id}')`);expect(await stage()).toBe('em_curso');
});
it('manager can close but cannot mark historical',async()=>{
 await db.exec(`UPDATE actor SET role='manager'; SELECT close_event('${id}')`);expect(await stage()).toBe('fechado');
 await expect(db.exec(`SELECT mark_event_historical('${id}')`)).rejects.toThrow('event_stage_permission_denied');
});
it('cross company event read is denied',async()=>{
 await db.exec(`UPDATE events SET company_id='30000000-0000-0000-0000-000000000001' WHERE id='${id}'`);await expect(stage()).rejects.toThrow('event_company_denied');
});
it('anon cannot execute new functions, writers authenticated only',async()=>{
 const rows=(await db.query<{name:string;anon:boolean;authenticated:boolean;service:boolean}>(`SELECT proname name,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service FROM pg_proc WHERE proname IN ('event_stage','close_event','_event_stage_guard')`)).rows;
 expect(rows.every(r=>!r.anon)).toBe(true);expect(rows.find(r=>r.name==='close_event')).toMatchObject({authenticated:true,service:false});expect(rows.find(r=>r.name==='_event_stage_guard')).toMatchObject({authenticated:false,service:false});
});
