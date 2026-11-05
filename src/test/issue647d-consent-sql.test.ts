// @vitest-environment node
// Inerte: só PostgreSQL WASM em memória, sem SQL remoto nem credenciais.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isProtectedZone, PROTECTED_ZONE } from "../../supabase/functions/_shared/protected-zone";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("drizzle/migrations/0334_issue647_song_link_consent.sql");
const manual = read("supabase/manual/0334_issue647_song_link_consent.sql");
const rollback = read("supabase/manual/rollback_0334_issue647_song_link_consent_comentado.sql");
const company = "10000000-0000-4000-8000-000000000001";
const artist = "10000000-0000-4000-8000-000000000002";
const otherCompany = "20000000-0000-4000-8000-000000000001";
const otherArtist = "20000000-0000-4000-8000-000000000002";
const user = "10000000-0000-4000-8000-000000000003";
const deniedUser = "20000000-0000-4000-8000-000000000003";
let db: PGlite;
async function scalar<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{ r: T }>(sql, params)).rows[0].r;
}
async function report(from = "2026-07-01", to = "2026-07-02", artistId = artist) {
  return (await db.query<{ dia: string; zona: string; consent_status: string | null; chegadas: number }>(
    `SELECT dia::text,zona,consent_status,chegadas::integer FROM song_link_consent_daily($1,$2,$3)`, [artistId, from, to])).rows;
}
async function insert(country: string | null, status: string | null, at = "2026-07-01T12:00:00Z", event = "arrival",
  companyId = company, artistId = artist) {
  await db.query(`INSERT INTO song_link_events(artist_id,company_id,event,country,created_at,consent_status) VALUES($1,$2,$3,$4,$5,$6)`,
    [artistId, companyId, event, country, at, status]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE ROLE sandbox_exec_sfohvvlqccmmebvjgibx NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
    CREATE TYPE public.app_role AS ENUM('user','admin','manager','marketing_manager','platform_admin');
    CREATE TABLE public.artists(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.user_roles(user_id uuid, company_id uuid, role app_role);
    CREATE TABLE public.artist_user_access(user_id uuid,artist_id uuid,revoked_at timestamptz,area_modes jsonb);
    CREATE FUNCTION public.has_role(uuid, app_role) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
    INSERT INTO artists VALUES('${artist}','${company}'),('${otherArtist}','${otherCompany}');
    INSERT INTO artist_user_access VALUES('${user}','${artist}',NULL,'{"songs":"view"}');
    CREATE TABLE public.song_link_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,artist_id uuid,
      event text CHECK(event IN('arrival','choice','app_open')),country text,created_at timestamptz NOT NULL);
    INSERT INTO song_link_events(company_id,artist_id,event,country,created_at)
      VALUES('${company}','${artist}','arrival','BR','2026-07-01T00:00:00Z');
    CREATE TABLE public.song_link_delivery_slots(arrival_event_id text, provider text,event_name text,
      PRIMARY KEY(arrival_event_id,provider,event_name),
      CONSTRAINT song_link_delivery_slots_event_name_check CHECK(event_name IN('ListenClick','CompleteRegistration')));`);
  // Read the actual canonical authorizer; no permissive stub concealing ACL/guard errors.
  const access = read("drizzle/migrations/0147_derp259_area_modes_view_edit.sql");
  const definition = access.match(/CREATE OR REPLACE FUNCTION public\.artist_access_check\([\s\S]*?\$\$;/)?.[0];
  if (!definition) throw new Error("missing canonical artist_access_check");
  await db.exec(definition);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("#647-d C3: 0334 preparada, colunas, CHECK e RPC", () => {
  it("cópia byte a byte e rollback inteiramente comentado", () => {
    expect(Buffer.compare(Buffer.from(migration), Buffer.from(manual))).toBe(0);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(rollback.split("\n").filter(line => line.trim() && !line.startsWith("--"))).toEqual([]);
    for (const command of ["DROP FUNCTION public.song_link_consent_daily", "DROP CONSTRAINT song_link_events_consent_status_check",
      "DROP COLUMN consent_status, DROP COLUMN consent_version, DROP COLUMN consent_at"]) expect(rollback).toContain(command);
  });
  it("três colunas anuláveis, sem default e sem backfill; CHECK validado", async () => {
    expect((await db.query(`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='song_link_events' AND column_name LIKE 'consent_%' ORDER BY column_name`)).rows).toEqual([
      { column_name: "consent_at", data_type: "timestamp with time zone", is_nullable: "YES", column_default: null },
      { column_name: "consent_status", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "consent_version", data_type: "text", is_nullable: "YES", column_default: null },
    ]);
    expect(await scalar("SELECT consent_status IS NULL AND consent_version IS NULL AND consent_at IS NULL r FROM song_link_events WHERE id=1")).toBe(true);
    expect(await scalar("SELECT convalidated r FROM pg_constraint WHERE conname='song_link_events_consent_status_check'")).toBe(true);
    for (const state of [null, "pending", "granted", "denied", "not_applicable"]) await insert("BR", state);
    await expect(insert("BR", "accepted")).rejects.toThrow("song_link_events_consent_status_check");
  });
  it("slots ViewContent separados, únicos e sem afrouxar valores inválidos", async () => {
    for (const event of ["ViewContent", "ListenClick", "CompleteRegistration"]) await db.query(
      "INSERT INTO song_link_delivery_slots VALUES('arrival','meta',$1)", [event]);
    expect(await scalar("SELECT count(*)::integer r FROM song_link_delivery_slots")).toBe(3);
    expect(await scalar("SELECT convalidated r FROM pg_constraint WHERE conname='song_link_delivery_slots_event_name_check'")).toBe(true);
    await db.exec("SAVEPOINT bad_slot");
    await expect(db.exec("INSERT INTO song_link_delivery_slots VALUES('arrival','meta','Invalid')")).rejects.toThrow("song_link_delivery_slots_event_name_check");
    await db.exec("ROLLBACK TO SAVEPOINT bad_slot");
    await expect(db.exec("INSERT INTO song_link_delivery_slots VALUES('arrival','meta','ViewContent')")).rejects.toThrow("duplicate key");
  });
  it("conta chegadas por dia de Lisboa, zona e estado; filtra artista e empresa", async () => {
    await db.exec("DELETE FROM song_link_events");
    await insert("BR", null, "2026-06-30T23:00:00Z"); // 01/07 00:00 Lisbon included
    await insert("BR", "pending"); await insert("BR", "pending");
    await insert("BR", "granted"); await insert("US", "denied"); await insert("PT", "not_applicable");
    await insert(null, "not_applicable");
    await insert("BR", "pending", "2026-07-01T12:00:00Z", "choice"); // not a second arrival
    await insert("BR", "granted", "2026-07-01T23:00:00Z"); // 02/07 in Lisbon
    await insert("BR", "granted", "2026-07-02T23:00:00Z"); // 03/07 excluded
    await insert("BR", "pending", "2026-06-30T22:59:59Z"); // before first day
    await insert("BR", "pending", "2026-07-01T12:00:00Z", "arrival", otherCompany); // forged mismatch
    await insert("BR", "pending", "2026-07-01T12:00:00Z", "arrival", otherCompany, otherArtist);
    expect(await report()).toEqual([
      { dia: "2026-07-01", zona: "fora", consent_status: "denied", chegadas: 1 },
      { dia: "2026-07-01", zona: "fora", consent_status: "granted", chegadas: 1 },
      { dia: "2026-07-01", zona: "fora", consent_status: "pending", chegadas: 2 },
      { dia: "2026-07-01", zona: "fora", consent_status: null, chegadas: 1 },
      { dia: "2026-07-01", zona: "protegida", consent_status: "not_applicable", chegadas: 2 },
      { dia: "2026-07-02", zona: "fora", consent_status: "granted", chegadas: 1 },
    ]);
  });
  it("lista inline corresponde ao helper para todos os países ISO e desconhecidos", async () => {
    await db.exec("DELETE FROM song_link_events");
    const source = read("supabase/functions/_shared/protected-zone.ts");
    const codes = [...new Set((source.match(/"AD AE[\s\S]*?\).split/)!)[0].match(/[A-Z]{2}/g))];
    const countries = [...codes, ...PROTECTED_ZONE, "pt", " br ", "XX", "ZZ", "T1", "BRA", "", " ", null];
    // Each day isolates one country for a direct SQL-vs-TypeScript comparison.
    for (let i = 0; i < countries.length; i++) await insert(countries[i], "pending", new Date(Date.UTC(2025, 0, 1 + i, 12)).toISOString());
    const rows = await report("2025-01-01", "2026-01-01");
    expect(rows).toHaveLength(countries.length);
    rows.forEach((row, i) => expect(row.zona, String(countries[i])).toBe(isProtectedZone(countries[i]) ? "protegida" : "fora"));
  });
  it("ACL nominal e PUBLIC, SECDEF e search_path fixo como 0299", async () => {
    for (const role of ["anon", "authenticated", "service_role", "sandbox_exec_sfohvvlqccmmebvjgibx"]) {
      expect(await scalar("SELECT has_function_privilege($1,'public.song_link_consent_daily(uuid,date,date)','EXECUTE') r", [role])).toBe(role !== "anon");
    }
    expect(await scalar(`SELECT NOT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(p.proacl) a
      WHERE p.oid='public.song_link_consent_daily(uuid,date,date)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') r`)).toBe(true);
    expect(await scalar("SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public'] r FROM pg_proc WHERE oid='public.song_link_consent_daily(uuid,date,date)'::regprocedure")).toBe(true);
  });
  it("autorização canónica sob identidade de sessão própria: permite songs e isola artista", async () => {
    await db.exec(`SET SESSION AUTHORIZATION authenticated; SET test.uid='${user}';`);
    expect((await report()).length).toBeGreaterThan(0);
    await expect(report("2026-07-01", "2026-07-02", otherArtist)).rejects.toThrow("sem acesso a este artista");
  });
  it("sem songs ou sem sessão recusa mesmo um intervalo sem dados", async () => {
    await db.exec(`SET SESSION AUTHORIZATION authenticated; SET test.uid='${deniedUser}'; SAVEPOINT no_access;`);
    await expect(report("2020-01-01", "2020-01-02")).rejects.toThrow("sem acesso a este artista");
    await db.exec("ROLLBACK TO SAVEPOINT no_access; SET test.uid=''; SAVEPOINT no_session;");
    await expect(report("2020-01-01", "2020-01-02")).rejects.toThrow("sessão obrigatória");
    await db.exec("ROLLBACK TO SAVEPOINT no_session");
  });
  it("service_role autorizado e anon impedido pela ACL", async () => {
    await db.exec("SET SESSION AUTHORIZATION service_role; SET test.role='service_role'");
    expect((await report()).length).toBeGreaterThan(0);
    await db.exec("RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION anon");
    await expect(report()).rejects.toThrow("permission denied for function song_link_consent_daily");
  });
});
