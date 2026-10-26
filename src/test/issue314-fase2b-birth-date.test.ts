// @vitest-environment node
// #314 Fase 2b — club_profile_birth_date (só a data), com a função real da 0267 e as definições Live em PGlite.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { profileBirth, profileBirthError } from "../../supabase/functions/newgang-portal/profile.ts";

const MIG = readFileSync("supabase/manual/0267_issue314_fase2b_birth_date_only.sql", "utf8");
const LIVE = readFileSync("src/test/fixtures/issue314-fase2b-live-fns.sql", "utf8");
const MP = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const SITE = "51000000-0000-0000-0000-000000000001";
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE portal_sites(id uuid PRIMARY KEY, company_id uuid, brand_key text, active boolean, event_id uuid);
  INSERT INTO portal_sites VALUES ('${SITE}','${MP}','newgang',true,NULL);
  CREATE TABLE club_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, company_id uuid, email text, phone text, confirmed_at timestamptz, updated_at timestamptz);
  CREATE TABLE club_member_sessions(token_hash text, site_id uuid, member_id uuid, purpose text, expires_at timestamptz);
  CREATE TABLE club_member_profiles(member_id uuid PRIMARY KEY, site_id uuid NOT NULL, company_id uuid NOT NULL, birth_date date, birth_country text,
    residence_country text, city text, completed_at timestamptz, award_event_id uuid, award_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE club_profile_settings(site_id uuid, company_id uuid, enabled boolean, version text);
  CREATE TABLE club_points(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid, rule_key text, ref_id text, points int);
  CREATE TABLE lock_calls(site uuid);
  CREATE FUNCTION _club_site_lock(p uuid, b boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO lock_calls VALUES (p) $$;
  CREATE FUNCTION club_city_normalize(c text, t text) RETURNS text LANGUAGE sql AS $$ SELECT t $$;`);
  await db.exec(LIVE);
  await db.exec(`CREATE TRIGGER club_profile_guard BEFORE INSERT OR DELETE OR UPDATE ON club_member_profiles FOR EACH ROW EXECUTE FUNCTION _club330_profile_guard();
  CREATE TRIGGER club332_city_profile BEFORE INSERT OR UPDATE OF city, residence_country ON club_member_profiles FOR EACH ROW EXECUTE FUNCTION _club332_city_profile();`);
  await db.exec(MIG);
}, 60000);
afterAll(async () => { await db?.close(); });

const one = async <T = Record<string, any>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];
const yearsAgo = async (y: number, plusDays = 0) =>
  (await one<{ d: string }>(`SELECT (((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - interval '${y} years' + interval '${plusDays} days')::date)::text d`)).d;

async function newMember(opts: { expired?: boolean; unconfirmed?: boolean } = {}) {
  n++;
  const m = await one<{ id: string }>(`INSERT INTO club_members(site_id,company_id,email,confirmed_at) VALUES ($1,$2,$3,${opts.unconfirmed ? "NULL" : "now()"}) RETURNING id`, [SITE, MP, `t${n}@ex.pt`]);
  const hash = `hash-${n}`;
  await db.query(`INSERT INTO club_member_sessions VALUES ($1,$2,$3,'access',now() + interval '${opts.expired ? "-1 hour" : "1 hour"}')`, [hash, SITE, m.id]);
  return { id: m.id, hash };
}
const call = (hash: string, payload: unknown) =>
  one<{ r: any }>(`SELECT club_profile_birth_date($1,$2,$3::jsonb) r`, [SITE, hash, JSON.stringify(payload)]).then((x) => x.r);
const err = async (hash: string, payload: unknown) => {
  try { await call(hash, payload); return "ok"; } catch (e) { return (e as Error).message; }
};
const profile = (id: string) => one<any>(`SELECT birth_date::text bd, completed_at, award_id, birth_country FROM club_member_profiles WHERE member_id=$1`, [id]);
const points = async () => Number((await one<{ c: string }>(`SELECT count(*) c FROM club_points`)).c);

describe("#314 Fase 2b club_profile_birth_date", () => {
  it("adulto sem linha de perfil: cria só birth_date, completed_at nulo, age_class adult, zero pontos", async () => {
    const p0 = await points();
    const m = await newMember();
    const bd = await yearsAgo(30);
    const r = await call(m.hash, { birth_date: bd });
    expect(r.ok).toBe(true);
    expect(r.profile.age_class).toBe("adult");
    expect(r.profile.birth_date).toBe(bd);
    const p = await profile(m.id);
    expect(p.bd).toBe(bd);
    expect(p.completed_at).toBeNull();
    expect(p.award_id).toBeNull();
    expect(p.birth_country).toBeNull();
    expect(await points()).toBe(p0);
  });

  it("13–17 grava como minor", async () => {
    const m = await newMember();
    expect((await call(m.hash, { birth_date: await yearsAgo(13) })).profile.age_class).toBe("minor");
    const m2 = await newMember();
    expect((await call(m2.hash, { birth_date: await yearsAgo(18, 1) })).profile.age_class).toBe("minor");
  });

  it("menor de 13: parental_flow_required e nenhuma linha criada", async () => {
    const m = await newMember();
    expect(await err(m.hash, { birth_date: await yearsAgo(13, 1) })).toBe("parental_flow_required");
    expect(await profile(m.id)).toBeUndefined();
  });

  it("data existente não é sobrescrita", async () => {
    const m = await newMember();
    const bd = await yearsAgo(25);
    await call(m.hash, { birth_date: bd });
    expect(await err(m.hash, { birth_date: await yearsAgo(40) })).toBe("birth_date_already_set");
    expect((await profile(m.id)).bd).toBe(bd);
  });

  it("linha de perfil existente sem data (ex.: perfil completo depois limpo) recebe a data sem tocar no resto", async () => {
    const m = await newMember();
    await db.query(`INSERT INTO club_member_profiles(member_id,site_id,company_id,birth_country,completed_at) VALUES ($1,$2,$3,'PT',now())`, [m.id, SITE, MP]);
    const before = await profile(m.id);
    await call(m.hash, { birth_date: await yearsAgo(20) });
    const after = await profile(m.id);
    expect(after.bd).not.toBeNull();
    expect(after.birth_country).toBe("PT");
    expect(after.completed_at).toEqual(before.completed_at);
  });

  it("payload: chave extra, tipo errado e não-objeto rejeitados", async () => {
    const m = await newMember();
    const bd = await yearsAgo(30);
    expect(await err(m.hash, { birth_date: bd, confirm: true })).toBe("profile_payload");
    expect(await err(m.hash, { birth_date: 19900101 })).toBe("profile_payload");
    expect(await err(m.hash, [bd])).toBe("profile_payload");
    expect(await err(m.hash, {})).toBe("profile_payload");
    expect(await profile(m.id)).toBeUndefined();
  });

  it("data futura, inválida e anterior a 1900 rejeitadas", async () => {
    const m = await newMember();
    for (const d of ["2999-01-01", "1990-02-30", "1899-12-31", "1990-1-1", "abc"]) {
      expect(await err(m.hash, { birth_date: d })).toBe("birth_date_invalid");
    }
    expect(await profile(m.id)).toBeUndefined();
  });

  it("sessão inválida, expirada ou membro não confirmado: no_session", async () => {
    const bd = await yearsAgo(30);
    expect(await err("inexistente", { birth_date: bd })).toBe("no_session");
    const e = await newMember({ expired: true });
    expect(await err(e.hash, { birth_date: bd })).toBe("no_session");
    const u = await newMember({ unconfirmed: true });
    expect(await err(u.hash, { birth_date: bd })).toBe("no_session");
    expect(await profile(e.id)).toBeUndefined();
  });

  it("ACL: só service_role executa", async () => {
    const r = await one<Record<string, boolean>>(`SELECT
      has_function_privilege('anon','club_profile_birth_date(uuid,text,jsonb)','EXECUTE') a,
      has_function_privilege('authenticated','club_profile_birth_date(uuid,text,jsonb)','EXECUTE') b,
      has_function_privilege('service_role','club_profile_birth_date(uuid,text,jsonb)','EXECUTE') c`);
    expect(r).toEqual({ a: false, b: false, c: true });
  });
});

describe("#314 Fase 2b ação profile_birth (newgang-portal)", () => {
  it("mapeia erros para HTTP", () => {
    expect(profileBirthError("no_session")).toBe(401);
    expect(profileBirthError("parental_flow_required")).toBe(409);
    expect(profileBirthError("birth_date_already_set")).toBe(409);
    expect(profileBirthError("birth_date_invalid")).toBe(400);
    expect(profileBirthError("profile_payload")).toBe(400);
    expect(profileBirthError("outro")).toBe(500);
  });
  it("chama club_profile_birth_date com o payload tal qual e devolve o perfil", async () => {
    const calls: any[] = [];
    const rpc = async (fn: string, a: any) => { calls.push([fn, a]); return { data: { ok: true, profile: { age_class: "adult" } }, error: null }; };
    const r = await profileBirth(rpc, SITE, "h", { birth_date: "1990-01-01" });
    expect(calls).toEqual([["club_profile_birth_date", { p_site: SITE, p_session_hash: "h", p_payload: { birth_date: "1990-01-01" } }]]);
    expect(r).toEqual({ status: 200, body: { ok: true, profile: { age_class: "adult" } } });
  });
  it("erro da BD vira status e código", async () => {
    const rpc = async () => ({ data: null, error: { message: "birth_date_already_set" } });
    expect(await profileBirth(rpc, SITE, "h", {})).toEqual({ status: 409, body: { error: "birth_date_already_set" } });
    const rpc2 = async () => ({ data: null, error: { message: "x" } });
    expect(await profileBirth(rpc2, SITE, "h", {})).toEqual({ status: 500, body: { error: "profile_birth_unavailable" } });
  });
  it("index.ts trata profile_birth como profile_confirm (sessão, rate-limit, chaves)", () => {
    const src = readFileSync("supabase/functions/newgang-portal/index.ts", "utf8");
    expect(src).toMatch(/"profile_birth"/);
    expect(src).toMatch(/case "profile_birth":/);
    for (const re of [/WRITE_ACTIONS = new Set\(\[[^\]]*"profile_birth"/, /\["profile_confirm", "profile_birth", "profile_preferences"\]\.includes\(raw\?\.action\) && Object\.keys/,
      /\["profile_confirm", "profile_birth", "profile_preferences"\]\.includes\(body\.action\) && \(rateError/, /\["me", "profile_confirm", "profile_birth", "profile_preferences"\]\.includes\(body\.action\) && \(!member/]) {
      expect(src).toMatch(re);
    }
  });
});
