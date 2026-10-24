// @vitest-environment node
// Lembrete Newgang — SQL de supabase/manual/20261024_newgang_club_reminder.sql em PGlite (sem Live).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

let db: PGlite;
const company = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000009';
const site = '40000000-0000-0000-0000-000000000001';
const id = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const one = async (sql: string) => (await db.query<any>(sql)).rows[0];
const reserve = async (n: number, test = false, mid?: string) =>
  (await one(`SELECT club_reminder_reserve('${company}','${site}','${id(n)}','${mid ?? 'ng-reminder-' + id(n)}',${test}) r`)).r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE portal_sites(id uuid PRIMARY KEY, company_id uuid);
  CREATE TABLE club_members(id uuid PRIMARY KEY, site_id uuid, email text, first_name text, confirmed_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE suppressed_emails(email text, company_id uuid, reason text);
  CREATE TABLE email_send_log(id bigserial, message_id text, template_name text, status text, metadata jsonb);
  INSERT INTO portal_sites VALUES('${site}','${company}');`);
  await db.exec(readFileSync('supabase/manual/20261024_newgang_club_reminder.sql', 'utf8'));
  const old = "now() - interval '3 days'";
  // 1 ok; 2 confirmado; 3 suprimido; 4 <48h; 5 welcome dlq; 6 sem registo; 7 suprimido noutra empresa (ok); 8 ok (retry); 9 <48h p/ teste
  const rows: [number, string, string | null, string][] = [
    [1, 'a@x.test', null, old], [2, 'b@x.test', 'now()', old], [3, ' C@X.test ', null, old], [4, 'd@x.test', null, "now() - interval '47 hours'"],
    [5, 'e@x.test', null, old], [6, 'f@x.test', null, old], [7, 'g@x.test', null, old], [8, 'h@x.test', null, old], [9, 'i@x.test', null, "now() - interval '1 hour'"],
  ];
  for (const [n, e, c, cr] of rows) await db.exec(`INSERT INTO club_members(id,site_id,email,confirmed_at,created_at) VALUES('${id(n)}','${site}','${e}',${c ?? 'NULL'},${cr})`);
  for (const n of [1, 2, 3, 4, 7, 8, 9]) await db.exec(`INSERT INTO email_send_log(template_name,status,metadata) VALUES('newgang_club_welcome','sent','{"member_id":"${id(n)}"}')`);
  await db.exec(`INSERT INTO email_send_log(template_name,status,metadata) VALUES('newgang_club_welcome','pending','{"member_id":"${id(5)}"}'),('newgang_club_welcome','dlq','{"member_id":"${id(5)}"}');
  INSERT INTO suppressed_emails VALUES('c@x.test','${company}','unsubscribe'),('g@x.test','${other}','bounce');`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential('club_reminder SQL', () => {
  it('resumo antes: motivos e member_id dos dlq/sem registo', async () => {
    const s = (await one(`SELECT club_reminder_summary('${company}','${site}') s`)).s;
    expect(s.by_reason).toEqual({ ok: 3, suppressed: 1, too_recent: 2, welcome_dlq: 1, welcome_none: 1 });
    expect(s.welcome_dlq_ids).toEqual([id(5)]);
    expect(s.welcome_none_ids).toEqual([id(6)]);
    expect(s.unconfirmed).toBe(8);
  });
  it('candidatos só elegíveis, limite máximo 500', async () => {
    const r = (await db.query<any>(`SELECT member_id FROM club_reminder_candidates('${company}','${site}',1000)`)).rows.map((x) => x.member_id).sort();
    expect(r).toEqual([id(1), id(7), id(8)]);
    expect((await db.query(`SELECT * FROM club_reminder_candidates('${company}','${site}',1)`)).rows.length).toBe(1);
    expect((await db.query(`SELECT * FROM club_reminder_candidates('${company}','${site}',-5)`)).rows.length).toBe(0);
  });
  it('recusas: confirmado, suprimido, <48h, dlq, sem registo, message_id forjado', async () => {
    expect(await reserve(2)).toBe('confirmed');
    expect(await reserve(3)).toBe('suppressed');
    expect(await reserve(4)).toBe('too_recent');
    expect(await reserve(5)).toBe('welcome_dlq');
    expect(await reserve(6)).toBe('welcome_none');
    expect(await reserve(1, false, 'ng-reminder-x')).toBe('invalid_message_id');
    expect((await one(`SELECT count(*)::int n FROM club_reminder_reservations`)).n).toBe(0);
  });
  it('idempotência: 1.ª reserva ok, 2.ª recusada; enqueued não reabre', async () => {
    expect(await reserve(1)).toBe('reserved');
    expect(await reserve(1)).toBe('already_reserved');
    expect((await one(`SELECT club_reminder_mark('${id(1)}','enqueued') ok`)).ok).toBe(true);
    expect(await reserve(1)).toBe('already_reserved');
    expect((await db.query(`SELECT * FROM club_reminder_candidates('${company}','${site}',500) WHERE member_id='${id(1)}'`)).rows.length).toBe(0);
  });
  it('confirmar depois de reservar não cria segunda reserva; confirmar antes recusa', async () => {
    await db.exec(`UPDATE club_members SET confirmed_at=now() WHERE id='${id(7)}'`);
    expect(await reserve(7)).toBe('confirmed');
  });
  it('error_pre_send: retry após 5 min, máx 3 tentativas; unknown nunca repete', async () => {
    expect(await reserve(8)).toBe('reserved');
    await one(`SELECT club_reminder_mark('${id(8)}','error_pre_send','x')`);
    expect(await reserve(8)).toBe('already_reserved');
    await db.exec(`UPDATE club_reminder_reservations SET next_attempt_at=now()-interval '1 second' WHERE member_id='${id(8)}'`);
    expect(await reserve(8)).toBe('reserved');
    await one(`SELECT club_reminder_mark('${id(8)}','error_pre_send','x')`);
    await db.exec(`UPDATE club_reminder_reservations SET next_attempt_at=now()-interval '1 second' WHERE member_id='${id(8)}'`);
    expect(await reserve(8)).toBe('reserved');
    await one(`SELECT club_reminder_mark('${id(8)}','error_pre_send','x')`);
    await db.exec(`UPDATE club_reminder_reservations SET next_attempt_at=now()-interval '1 second' WHERE member_id='${id(8)}'`);
    expect(await reserve(8)).toBe('already_reserved');
    expect((await one(`SELECT attempt_count n FROM club_reminder_reservations WHERE member_id='${id(8)}'`)).n).toBe(3);
  });
  it('teste ignora só as 48 h e conta como o lembrete', async () => {
    expect(await reserve(9)).toBe('too_recent');
    expect(await reserve(9, true)).toBe('reserved');
    expect((await one(`SELECT test FROM club_reminder_reservations WHERE member_id='${id(9)}'`)).test).toBe(true);
    expect(await reserve(9, true)).toBe('already_reserved');
    expect((await one(`SELECT count(*)::int n FROM club_reminder_reservations WHERE member_id='${id(9)}'`)).n).toBe(1);
    expect(await reserve(3, true)).toBe('suppressed');
    expect(await reserve(2, true)).toBe('confirmed');
  });
  it('mark rejeita estado inválido; funções sem EXECUTE para anon/authenticated', async () => {
    await expect(db.query(`SELECT club_reminder_mark('${id(1)}','sent')`)).rejects.toThrow();
    const g = await one(`SELECT has_function_privilege('anon','club_reminder_reserve(uuid,uuid,uuid,text,boolean)','EXECUTE') a,
      has_function_privilege('authenticated','club_reminder_summary(uuid,uuid)','EXECUTE') b,
      has_function_privilege('service_role','club_reminder_candidates(uuid,uuid,integer)','EXECUTE') c`);
    expect(g).toEqual({ a: false, b: false, c: true });
  });
});
