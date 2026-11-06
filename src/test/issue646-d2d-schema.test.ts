// @vitest-environment node
// SQL real apenas em PGlite efémero, sem credenciais, rede ou dados MP.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0341_issue646_ticket_forecast_pct.sql", "utf8");
const manual = readFileSync("supabase/manual/0341_issue646_ticket_forecast_pct.sql", "utf8");
const copySql = readFileSync("supabase/manual/0341_issue646_copiar_ticket_forecast_pct.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0341_issue646_ticket_forecast_pct_comentado.sql", "utf8");
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C = uuid(1), OTHER = uuid(2), ROOT = uuid(10), CHILD = uuid(11), OVERRIDE = uuid(12);
const REAL = uuid(13), NONE = uuid(14), FOREIGN = uuid(15), SESSION = uuid(20), VERSION = uuid(30);
const users = { viewer: 101, admin: 102, manager: 103, platform: 104, denied: 105, tickets: 106, other: 107 };
let db: PGlite;
type MapLine = { event_id: string; session_date: string | null; session_start_time: string | null; session_sort_order: number | null; percentagem: number };
const line = (event: string, pct: number, date: string | null = null, time: string | null = null, order: number | null = null): MapLine =>
  ({ event_id: event, percentagem: pct, session_date: date, session_start_time: time, session_sort_order: order });
const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const scalar = async (sql: string) => (await rows<{ v: number }>(sql))[0].v;
const counts = async () => Promise.all([
  scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct"),
  scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct_log"),
  scalar("SELECT count(*)::int v FROM event_ticket_forecast_rollouts"),
]);
// PGlite mantém a autorização ao receber RESET SESSION AUTHORIZATION; repor explicitamente.
const owner = () => db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE;");
async function asUser(name: keyof typeof users) {
  await owner();
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uuid(users[name])]);
  await db.exec("SET SESSION AUTHORIZATION authenticated");
}
async function rpc(events = [ROOT], company = C, version: string | null = null) {
  const result = await db.query<{ v: { version: string; events: Array<{ event_id: string; percentagem: number; origem: string; receita_manual_iva_rate: number | null; sessions: Array<{ session_id: string; percentagem: number; origem: string }> }> } }>(
    "SELECT get_event_ticket_forecast_inputs($1, $2::uuid[], $3) v", [company, events, version]);
  return result.rows[0].v;
}
async function pct(event: string, value = "DEFAULT", suffix = "", values = "") {
  await db.exec(`INSERT INTO event_ticket_forecast_pct(event_id, percentagem${suffix}) VALUES ('${event}', ${value}${values})`);
}
async function scenario(event: string, mode: "previsao" | "real", percent: number) {
  await db.query("INSERT INTO event_coverage_scenarios(event_id,company_id,modo,percentagem) VALUES($1,$2,$3,$4)",
    [event, event === FOREIGN ? OTHER : C, mode, percent]);
}
// O snapshot é exactamente o contrato de entrada do template. Os mapas esperados dos testes
// são escritos à mão; não usam a resolução/geração do DML para calcular a expectativa.
async function copyParams(expected: MapLine[]) {
  const snapshot = copySql.split("-- SOURCE SNAPSHOT BEGIN")[1].split("-- SOURCE SNAPSHOT END")[0]
    .replace("INTO v_source", "").replaceAll("v_company", `'${C}'::uuid`);
  const sourceResult = await db.query<{ source: string }>(`SELECT encode(sha256(convert_to(snapshot.v::text, 'UTF8')), 'hex') source
    FROM (${snapshot.trim().replace(/;$/, "")} ) snapshot(v)`);
  const hashes = await db.query<{ target: string }>(`SELECT
    encode(sha256(convert_to(coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.event_id,
      x.session_date NULLS FIRST, x.session_start_time NULLS FIRST, x.session_sort_order NULLS FIRST)
      FROM jsonb_to_recordset($1::jsonb) AS x(event_id uuid, session_date date, session_start_time time,
        session_sort_order integer, percentagem numeric(5,2))), '[]'::jsonb)::text, 'UTF8')), 'hex') target`,
    [JSON.stringify(expected)]);
  return { company_id: C, rollout_version: "legacy-0289-v1", expected_source_sha256: sourceResult.rows[0].source,
    expected_source_count: String(await scalar(`SELECT count(*)::int v FROM events WHERE company_id='${C}'`)),
    expected_target_sha256: hashes.rows[0].target, expected_target_count: String(expected.length) };
}
async function copy(params: Awaited<ReturnType<typeof copyParams>>, role = "service_role") {
  await owner();
  await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec(`SET SESSION AUTHORIZATION ${role}`);
  const sql = copySql.replace(/:'([a-z_0-9]+)'/g, (_, key: keyof typeof params) => `'${params[key].replaceAll("'", "''")}'`);
  try { await db.exec(sql); }
  catch (error) { await db.exec("ROLLBACK"); throw error; }
  finally { await owner(); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
    CREATE TABLE test_users(id uuid PRIMARY KEY, company_id uuid, role app_role, permission text);
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), parent_event_id uuid REFERENCES events(id));
    CREATE TABLE bp_versions(id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id));
    CREATE TABLE event_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
      event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, date date NOT NULL, start_time time,
      sort_order integer NOT NULL DEFAULT 1, version_id uuid REFERENCES bp_versions(id));
    CREATE TABLE event_coverage_scenarios(event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      company_id uuid NOT NULL, modo text NOT NULL DEFAULT 'real' CHECK(modo IN ('previsao','real')),
      percentagem numeric(5,2) NOT NULL DEFAULT 0 CHECK(percentagem BETWEEN 0 AND 100),
      receita_manual_bruta numeric(14,2), viragem_real_dias integer, updated_by uuid, updated_at timestamptz DEFAULT now());
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$SELECT company_id FROM test_users WHERE id=auth.uid()$$;
    CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=current_company_id()$$;
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$SELECT coalesce((SELECT role=$2 FROM test_users WHERE id=$1), false)$$;
    CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT has_role($1,'platform_admin')$$;
    CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$SELECT coalesce((SELECT permission=$2 FROM test_users WHERE id=$1), false)$$;
    GRANT USAGE ON SCHEMA public,auth TO anon, authenticated,service_role;
    GRANT SELECT ON companies,events,bp_versions,event_sessions,event_coverage_scenarios TO authenticated;
    GRANT ALL ON companies,events,bp_versions,event_sessions,event_coverage_scenarios TO service_role;
    INSERT INTO companies VALUES('${C}'),('${OTHER}');
    INSERT INTO test_users VALUES
      ('${uuid(users.viewer)}','${C}','viewer','view_financial_position'),
      ('${uuid(users.admin)}','${C}','admin',null),('${uuid(users.manager)}','${C}','manager',null),
      ('${uuid(users.platform)}','${C}','platform_admin',null),('${uuid(users.denied)}','${C}','viewer',null),
      ('${uuid(users.tickets)}','${C}','viewer','manage_tickets'),
      ('${uuid(users.other)}','${OTHER}','manager',null);`);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await owner();
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${uuid(users.admin)}',false);
    DELETE FROM event_ticket_forecast_rollouts;
    DELETE FROM event_ticket_forecast_pct;
    DELETE FROM event_ticket_forecast_pct_log;
    DELETE FROM event_coverage_scenarios;
    DELETE FROM event_sessions;
    DELETE FROM bp_versions;
    UPDATE events SET parent_event_id=null;
    DELETE FROM events;
    INSERT INTO events VALUES('${ROOT}','${C}',null),('${CHILD}','${C}','${ROOT}'),
      ('${OVERRIDE}','${C}','${ROOT}'),('${REAL}','${C}',null),('${NONE}','${C}',null),('${FOREIGN}','${OTHER}',null);
    INSERT INTO bp_versions VALUES('${VERSION}','${ROOT}');
    INSERT INTO event_sessions(id,company_id,event_id,date,start_time,sort_order) VALUES('${SESSION}','${C}','${ROOT}','2099-01-01',null,1);`);
});

describe("#646 D2-d — contrato estrutural", () => {
  it("as 0341 são byte a byte iguais e o rollback contém só comentários", () => {
    expect(Buffer.from(migration)).toEqual(Buffer.from(manual));
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(rollback.split("\n").every(l => !l.trim() || l.startsWith("--"))).toBe(true);
    expect(copySql).toContain(":'company_id'");
    expect(copySql).not.toMatch(/ON CONFLICT|DO NOTHING/i);
    expect(migration).not.toMatch(/\bDROP\b/);
    expect(createHash("sha256").update(migration).digest("hex")).toHaveLength(64);
  });
  it("seq é bigint identity ALWAYS, obrigatório e único, com índice por evento/seq", async () => {
    expect(await rows(`SELECT data_type,is_identity,identity_generation,is_nullable
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name='event_ticket_forecast_pct_log' AND column_name='seq'`)).toEqual([
      { data_type: "bigint", is_identity: "YES", identity_generation: "ALWAYS", is_nullable: "NO" },
    ]);
    const [index] = await rows<{ definition: string }>(
      "SELECT pg_get_indexdef('ticket_forecast_pct_log_event_idx'::regclass) definition");
    expect(index.definition).toContain("(event_id, seq)");
    await pct(ROOT);
    const duplicate = `INSERT INTO event_ticket_forecast_pct_log(seq,forecast_pct_id,company_id,event_id,op)
      SELECT seq,forecast_pct_id,company_id,event_id,op FROM event_ticket_forecast_pct_log`;
    await expect(db.exec(duplicate)).rejects.toThrow(/cannot insert a non-DEFAULT value into column "seq"/);
    await expect(db.exec(duplicate.replace("SELECT seq", "OVERRIDING SYSTEM VALUE SELECT seq"))).rejects.toThrow(/duplicate key/);
    expect(await scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct_log")).toBe(1);
  });
  it("nasce sem backfill, com default 100; deriva empresa, relógio e autor", async () => {
    expect(await counts()).toEqual([0, 0, 0]);
    await asUser("admin");
    await pct(ROOT, "DEFAULT", ",company_id,created_at,updated_at,updated_by", `,'${OTHER}','2000-01-01','2000-01-01','${uuid(users.other)}'`);
    const [p] = await rows<{ company_id: string; percentagem: string; updated_by: string; created_at: Date; updated_at: Date }>("SELECT * FROM event_ticket_forecast_pct");
    expect(p.company_id).toBe(C); expect(Number(p.percentagem)).toBe(100); expect(p.updated_by).toBe(uuid(users.admin));
    expect(p.created_at.getUTCFullYear()).toBeGreaterThan(2020); expect(p.updated_at).toEqual(p.created_at);
    const created = p.created_at;
    await db.exec(`UPDATE event_ticket_forecast_pct SET created_at='1900-01-01',updated_at='1900-01-01',updated_by='${uuid(users.other)}',percentagem=0`);
    const [updated] = await rows<typeof p>("SELECT * FROM event_ticket_forecast_pct");
    expect(updated.created_at).toEqual(created); expect(updated.updated_by).toBe(uuid(users.admin));
    expect(updated.updated_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
  it.each(["-0.01", "100.01", "'NaN'", "'Infinity'", "'-Infinity'", "NULL"])("recusa percentagem inválida %s", async bad => {
    await expect(pct(ROOT, bad)).rejects.toThrow(); expect(await counts()).toEqual([0,0,0]);
  });
  it("aceita 0 e 100 e recusa formas de chave incompletas", async () => {
    await pct(ROOT, "0"); await pct(CHILD, "100");
    for (const [suffix, value] of [[",session_start_time", ",'12:00'"], [",session_sort_order", ",1"], [",session_date", ",'2099-01-01'"]]) {
      await expect(pct(NONE, "25", suffix, value)).rejects.toThrow();
    }
  });
  it("unicidade de evento e de sessão trata hora NULL como igual", async () => {
    await pct(ROOT, "50"); await expect(pct(ROOT, "25")).rejects.toThrow(/duplicate key/);
    await pct(ROOT, "0", ",session_date,session_sort_order", ",'2099-01-01',1");
    await expect(pct(ROOT, "25", ",session_date,session_sort_order", ",'2099-01-01',1")).rejects.toThrow(/duplicate key/);
    await db.exec(`INSERT INTO event_sessions(company_id,event_id,date,start_time,sort_order) VALUES('${C}','${ROOT}','2099-01-01','20:00',1)`);
    await pct(ROOT, "25", ",session_date,session_start_time,session_sort_order", ",'2099-01-01','20:00',1");
    expect(await scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct")).toBe(3);
  });
  it("id e evento são imutáveis", async () => {
    await pct(ROOT); await expect(db.exec(`UPDATE event_ticket_forecast_pct SET id='${uuid(500)}'`)).rejects.toThrow(/identity_immutable/);
    await expect(db.exec(`UPDATE event_ticket_forecast_pct SET event_id='${CHILD}'`)).rejects.toThrow(/identity_immutable/);
  });
  it("recusa sessão ausente, empresa divergente e identidade ambígua", async () => {
    await expect(pct(ROOT, "50", ",session_date,session_sort_order", ",'2099-01-02',1")).rejects.toThrow(/session_not_found/);
    await db.exec(`UPDATE event_sessions SET company_id='${OTHER}'`);
    await expect(pct(ROOT, "50", ",session_date,session_sort_order", ",'2099-01-01',1")).rejects.toThrow(/session_not_found/);
    await db.exec(`UPDATE event_sessions SET company_id='${C}'; INSERT INTO event_sessions(company_id,event_id,date,sort_order) VALUES('${C}','${ROOT}','2099-01-01',1)`);
    await expect(pct(ROOT, "50", ",session_date,session_sort_order", ",'2099-01-01',1")).rejects.toThrow(/session_ambiguous/);
  });
  it("a mesma chave em duas versões resolve UUIDs diferentes e conserva o override", async () => {
    await db.exec(`INSERT INTO event_sessions(id,company_id,event_id,date,sort_order,version_id) VALUES('${uuid(21)}','${C}','${ROOT}','2099-01-01',1,'${VERSION}')`);
    await pct(ROOT, "0", ",session_date,session_sort_order", ",'2099-01-01',1");
    await asUser("viewer");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({session_id: SESSION, percentagem: 0, origem: "sessao"});
    expect((await rpc([ROOT], C, VERSION)).events[0].sessions[0]).toMatchObject({session_id: uuid(21), percentagem: 0, origem: "sessao"});
  });
  it("recriar UUID não perde configuração; uma nova identidade lógica herda a data", async () => {
    await pct(ROOT, "60");
    await pct(ROOT, "25", ",session_date,session_sort_order", ",'2099-01-01',1");
    await db.exec(`DELETE FROM event_sessions WHERE id='${SESSION}';
      INSERT INTO event_sessions(id,company_id,event_id,date,sort_order) VALUES('${uuid(22)}','${C}','${ROOT}','2099-01-01',1)`);
    await asUser("viewer");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({session_id:uuid(22),percentagem:25,origem:"sessao"});
    await owner(); await db.exec(`UPDATE event_sessions SET sort_order=2 WHERE id='${uuid(22)}'`);
    await asUser("viewer");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({session_id:uuid(22),percentagem:60,origem:"evento"});
    expect(await scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct")).toBe(2);
  });
  it("recusa chave que também existe numa versão pertencente a outro evento", async () => {
    await db.exec(`INSERT INTO bp_versions VALUES('${uuid(31)}','${CHILD}');
      INSERT INTO event_sessions(company_id,event_id,date,sort_order,version_id) VALUES('${C}','${ROOT}','2099-01-01',1,'${uuid(31)}')`);
    await expect(pct(ROOT,"25",",session_date,session_sort_order",",'2099-01-01',1")).rejects.toThrow(/version_mismatch/);
  });
  it("histórico conserva old/new e sobrevive à eliminação em cascata do evento", async () => {
    await pct(CHILD, "50"); await db.exec("UPDATE event_ticket_forecast_pct SET percentagem=0");
    await db.exec(`DELETE FROM events WHERE id='${CHILD}'`);
    expect(await scalar("SELECT count(*)::int v FROM event_ticket_forecast_pct")).toBe(0);
    const log = await rows<{ op: string; old: { percentagem: number } | null; new: { percentagem: number } | null }>("SELECT op,old,new FROM event_ticket_forecast_pct_log ORDER BY seq");
    expect(log.map(l => l.op)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(log[1].old?.percentagem).toBe(50); expect(log[1].new?.percentagem).toBe(0);
    expect(log[2].old?.percentagem).toBe(0); expect(log[2].new).toBeNull();
  });
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    "seq conserva INSERT, UPDATE, DELETE na mesma transacção (repetição %i/20)", async () => {
      await asUser("admin");
      const log = await db.transaction(async tx => {
        await tx.exec(`INSERT INTO event_ticket_forecast_pct(event_id,percentagem) VALUES('${ROOT}',50);
          UPDATE event_ticket_forecast_pct SET percentagem=0 WHERE event_id='${ROOT}';
          DELETE FROM event_ticket_forecast_pct WHERE event_id='${ROOT}';`);
        return (await tx.query<{ seq_text: string; op: string; same_timestamp: boolean }>(
          `SELECT seq::text AS seq_text,op,changed_at=transaction_timestamp() AS same_timestamp
           FROM event_ticket_forecast_pct_log WHERE event_id='${ROOT}' ORDER BY seq`)).rows;
      });
      expect(log.map(l => l.op)).toEqual(["INSERT", "UPDATE", "DELETE"]);
      expect(log.map(l => l.same_timestamp)).toEqual([true, true, true]);
      expect(BigInt(log[0].seq_text) < BigInt(log[1].seq_text)).toBe(true);
      expect(BigInt(log[1].seq_text) < BigInt(log[2].seq_text)).toBe(true);
    },
  );
  it("IVA nasce NULL e admite 0/valor, recusando fora da faixa/NaN sem alterar modo ou percentagem", async () => {
    await scenario(ROOT, "previsao", 37);
    expect((await rows("SELECT receita_manual_iva_rate FROM event_coverage_scenarios"))[0].receita_manual_iva_rate).toBeNull();
    for (const iva of [0, 6, 23.5, 100]) {
      await db.query("UPDATE event_coverage_scenarios SET receita_manual_iva_rate=$1", [iva]);
      const [s] = await rows<{ modo: string; percentagem: string; receita_manual_iva_rate: string }>("SELECT * FROM event_coverage_scenarios");
      expect(Number(s.receita_manual_iva_rate)).toBe(iva); expect(s.modo).toBe("previsao"); expect(Number(s.percentagem)).toBe(37);
    }
    for (const bad of ["-0.01", "100.01", "'NaN'", "'Infinity'"]) {
      await expect(db.exec(`UPDATE event_coverage_scenarios SET receita_manual_iva_rate=${bad}`)).rejects.toThrow();
    }
    await db.exec("UPDATE event_coverage_scenarios SET receita_manual_iva_rate=null");
    await asUser("viewer"); expect((await rpc()).events[0].receita_manual_iva_rate).toBeNull();
  });
});

describe("#646 D2-d — leitura e segurança por comportamento", () => {
  it("resolve sessão → data/evento → 100; zero é explícito e limpar restaura a origem seguinte", async () => {
    await asUser("admin");
    expect((await rpc()).events[0]).toMatchObject({percentagem:100,origem:"padrao"});
    await pct(ROOT, "60"); expect((await rpc()).events[0].sessions[0]).toMatchObject({percentagem:60,origem:"evento"});
    expect((await rpc([CHILD])).events[0]).toMatchObject({percentagem:100,origem:"padrao"});
    await pct(ROOT, "0", ",session_date,session_sort_order", ",'2099-01-01',1");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({percentagem:0,origem:"sessao"});
    await db.exec("DELETE FROM event_ticket_forecast_pct WHERE session_date IS NOT NULL");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({percentagem:60,origem:"evento"});
    await db.exec("DELETE FROM event_ticket_forecast_pct");
    expect((await rpc()).events[0].sessions[0]).toMatchObject({percentagem:100,origem:"padrao"});
    await pct(ROOT, "100"); expect((await rpc()).events[0]).toMatchObject({percentagem:100,origem:"evento"});
  });
  it.each(["admin", "manager", "platform"] as const)("%s lê/escreve apenas na empresa activa, incluindo log/recibo", async name => {
    await pct(FOREIGN, "75"); await pct(ROOT, "50");
    await db.exec(`INSERT INTO event_ticket_forecast_rollouts VALUES('${C}','v','${"a".repeat(64)}','${"b".repeat(64)}',1,1,now()),('${OTHER}','v','${"a".repeat(64)}','${"b".repeat(64)}',1,1,now())`);
    await asUser(name);
    expect((await rows("SELECT event_id FROM event_ticket_forecast_pct")).map(r=>r.event_id)).toEqual([ROOT]);
    expect((await rows("SELECT company_id FROM event_ticket_forecast_pct_log")).every(r=>r.company_id===C)).toBe(true);
    expect((await rows("SELECT company_id FROM event_ticket_forecast_rollouts"))).toEqual([{company_id:C}]);
    await pct(CHILD, "25");
    await db.exec(`UPDATE event_ticket_forecast_pct SET percentagem=0 WHERE event_id='${ROOT}'`);
    expect((await rpc()).events[0].percentagem).toBe(0);
    expect(await rows(`UPDATE event_ticket_forecast_pct SET percentagem=0 WHERE event_id='${FOREIGN}' RETURNING id`)).toEqual([]);
    expect(await rows(`DELETE FROM event_ticket_forecast_pct WHERE event_id='${FOREIGN}' RETURNING id`)).toEqual([]);
    await expect(pct(FOREIGN, "25")).rejects.toThrow(/row-level security/);
    await expect(rpc([FOREIGN], OTHER)).rejects.toThrow(/company_forbidden/);
    await expect(rpc([ROOT, FOREIGN])).rejects.toThrow(/invalid_events/);
  });
  it("viewer autorizado lê mas não escreve; outra empresa tem o seu próprio perímetro", async () => {
    await pct(ROOT); await pct(FOREIGN, "75"); await asUser("viewer");
    expect((await rpc()).events[0].percentagem).toBe(100);
    await expect(pct(CHILD)).rejects.toThrow(/row-level security/);
    expect(await rows("UPDATE event_ticket_forecast_pct SET percentagem=0 RETURNING id")).toEqual([]);
    expect(await rows("DELETE FROM event_ticket_forecast_pct RETURNING id")).toEqual([]);
    await asUser("other"); expect((await rows("SELECT event_id FROM event_ticket_forecast_pct"))).toEqual([{event_id:FOREIGN}]);
    expect((await rpc([FOREIGN], OTHER)).events[0].percentagem).toBe(75);
    await expect(rpc([ROOT], OTHER)).rejects.toThrow(/invalid_events/);
  });
  it.each(["denied", "tickets"] as const)("%s não lê nem escreve; manage_tickets não concede acesso", async name => {
    await pct(ROOT); await asUser(name);
    for (const table of ["event_ticket_forecast_pct", "event_ticket_forecast_pct_log", "event_ticket_forecast_rollouts"]) expect(await rows(`SELECT * FROM ${table}`)).toEqual([]);
    await expect(pct(CHILD)).rejects.toThrow(/row-level security/);
    await expect(rpc()).rejects.toThrow(/permission_denied/);
  });
  it("anon não tem SELECT/DML/RPC nem EXECUTE privado; authenticated/service_role não têm TRUNCATE ou escrita no log", async () => {
    await db.exec("SET SESSION AUTHORIZATION anon");
    for (const table of ["event_ticket_forecast_pct", "event_ticket_forecast_pct_log", "event_ticket_forecast_rollouts"]) {
      await expect(db.exec(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      await expect(db.exec(`INSERT INTO ${table} DEFAULT VALUES`)).rejects.toThrow(/permission denied/);
      await expect(db.exec(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(rpc()).rejects.toThrow(/permission denied/);
    await owner();
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["USAGE", "SELECT", "UPDATE"]) {
        expect((await rows<{v:boolean}>(`SELECT has_sequence_privilege('${role}',
          pg_get_serial_sequence('event_ticket_forecast_pct_log','seq'),'${privilege}') v`))[0].v).toBe(false);
      }
      for (const fn of ["stamp_pct", "log_pct"]) {
        expect((await rows<{v:boolean}>(`SELECT has_function_privilege('${role}','issue646_private.${fn}()','EXECUTE') v`))[0].v).toBe(false);
      }
      for (const table of ["event_ticket_forecast_pct", "event_ticket_forecast_pct_log", "event_ticket_forecast_rollouts"]) {
        expect((await rows<{v:boolean}>(`SELECT has_table_privilege('${role}','${table}','TRUNCATE') v`))[0].v).toBe(false);
      }
    }
    for (const role of ["authenticated", "service_role"]) {
      await db.exec(`SET SESSION AUTHORIZATION ${role}`);
      await expect(db.exec(`INSERT INTO event_ticket_forecast_pct_log(forecast_pct_id,company_id,event_id,op) VALUES('${uuid(555)}','${C}','${ROOT}','INSERT')`)).rejects.toThrow(/permission denied/);
      await expect(db.exec("UPDATE event_ticket_forecast_pct_log SET op='DELETE'")).rejects.toThrow(/permission denied/);
      await expect(db.exec("UPDATE event_ticket_forecast_pct_log SET seq=DEFAULT")).rejects.toThrow(/permission denied/);
      await expect(db.exec("DELETE FROM event_ticket_forecast_pct_log")).rejects.toThrow(/permission denied/);
      await owner();
    }
  });
  it("recibo só admite escrita por service_role, que continua sem poder forjar autoria humana", async () => {
    const receipt = `INSERT INTO event_ticket_forecast_rollouts(company_id,version,source_sha256,target_sha256,source_count,target_count) VALUES('${C}','v','${"a".repeat(64)}','${"b".repeat(64)}',0,0)`;
    for (const name of ["admin", "manager", "platform", "viewer"] as const) {
      await asUser(name); await expect(db.exec(receipt)).rejects.toThrow(/permission denied/);
      await expect(db.exec("UPDATE event_ticket_forecast_rollouts SET version='forged'")).rejects.toThrow(/permission denied/);
      await expect(db.exec("DELETE FROM event_ticket_forecast_rollouts")).rejects.toThrow(/permission denied/);
    }
    await owner(); await db.exec("SELECT set_config('request.jwt.claim.sub','',false); SET SESSION AUTHORIZATION service_role");
    await db.exec(receipt); await pct(ROOT, "0", ",updated_by", `,'${uuid(users.admin)}'`);
    expect((await rows("SELECT updated_by FROM event_ticket_forecast_pct"))).toEqual([{updated_by:null}]);
    expect(await scalar("SELECT count(*)::int v FROM event_ticket_forecast_rollouts")).toBe(1);
  });
  it("RPC recusa falta de JWT, IDs ausentes/duplicados/lote >100, versão alheia e sessão ambígua após configuração", async () => {
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await expect(rpc()).rejects.toThrow(/not_authenticated/);
    await asUser("viewer");
    for (const ids of [[], [ROOT, ROOT], [uuid(999)], Array.from({length:101},(_,i)=>uuid(i+1000))]) await expect(rpc(ids)).rejects.toThrow(/invalid_events/);
    await expect(rpc([CHILD], C, VERSION)).rejects.toThrow(/invalid_version/);
    await owner(); await pct(ROOT, "50", ",session_date,session_sort_order", ",'2099-01-01',1");
    await db.exec(`INSERT INTO event_sessions(company_id,event_id,date,sort_order) VALUES('${C}','${ROOT}','2099-01-01',1)`);
    await asUser("viewer"); await expect(rpc()).rejects.toThrow(/session_ambiguous/);
  });
  it("RPC não contorna isolamento perante divergência de empresa em dados existentes", async () => {
    await pct(ROOT,"25");
    await db.exec(`UPDATE events SET company_id='${OTHER}' WHERE id='${ROOT}'`);
    await asUser("other"); await expect(rpc([ROOT],OTHER)).rejects.toThrow(/input_company_mismatch/);
    await owner(); await db.exec(`UPDATE events SET company_id='${C}' WHERE id='${ROOT}'`);
    await scenario(ROOT,"previsao",50);
    await db.exec(`UPDATE event_coverage_scenarios SET company_id='${OTHER}' WHERE event_id='${ROOT}'`);
    await asUser("viewer"); await expect(rpc()).rejects.toThrow(/input_company_mismatch/);
  });
});

describe("#646 D2-d — cópia parametrizada e recibo atómico", () => {
  const expected = () => [line(ROOT,50), line(ROOT,50,"2099-01-01",null,1),line(CHILD,50),line(OVERRIDE,25),line(REAL,0)];
  const seedCopy = async () => { await scenario(ROOT,"previsao",50); await scenario(OVERRIDE,"previsao",25); await scenario(REAL,"real",77); };
  it("copia previsão, real=0, herança e override; sem cenário não cria linha; reexecução não escreve nada", async () => {
    await seedCopy();
    await db.exec(`INSERT INTO event_sessions(company_id,event_id,date,sort_order,version_id) VALUES('${C}','${ROOT}','2099-01-01',1,'${VERSION}')`);
    const params = await copyParams(expected());
    const oldScenarios = await rows("SELECT * FROM event_coverage_scenarios ORDER BY event_id");
    await copy(params);
    expect(await counts()).toEqual([5,5,1]);
    const configs = await rows<{event_id:string;percentagem:string;session_date:Date|null}>("SELECT event_id,percentagem,session_date FROM event_ticket_forecast_pct ORDER BY event_id,session_date NULLS FIRST");
    expect(configs.map(p=>[p.event_id,Number(p.percentagem)])).toEqual([[ROOT,50],[ROOT,50],[CHILD,50],[OVERRIDE,25],[REAL,0]]);
    expect(configs.find(p=>p.event_id===NONE)).toBeUndefined();
    expect(await rows("SELECT * FROM event_coverage_scenarios ORDER BY event_id")).toEqual(oldScenarios);
    const before = await rows("SELECT * FROM event_ticket_forecast_rollouts");
    await copy(params); expect(await counts()).toEqual([5,5,1]); expect(await rows("SELECT * FROM event_ticket_forecast_rollouts")).toEqual(before);
    await asUser("viewer");
    expect((await rpc([REAL, NONE])).events.map(e=>[e.event_id,e.percentagem,e.origem])).toEqual([[REAL,0,"evento"],[NONE,100,"padrao"]]);
  });
  it("copia 0/100 previstos e eventos sem cenário permanecem ausentes", async () => {
    await scenario(CHILD,"previsao",0); await scenario(REAL,"previsao",100);
    await copy(await copyParams([line(CHILD,0),line(REAL,100)])); expect(await counts()).toEqual([2,2,1]);
  });
  it("recusa execução por utilizador mesmo com parâmetros válidos", async () => {
    await seedCopy(); const params = await copyParams(expected());
    await expect(copy(params,"authenticated")).rejects.toThrow(/service_role_required/); expect(await counts()).toEqual([0,0,0]);
  });
  it("origem mudada desde a prova recusa antes de escrever", async () => {
    await seedCopy(); const params = await copyParams(expected()); await db.exec(`UPDATE event_coverage_scenarios SET percentagem=51 WHERE event_id='${ROOT}'`);
    await expect(copy(params)).rejects.toThrow(/source_changed/); expect(await counts()).toEqual([0,0,0]);
  });
  it("mapa/hash/contagem esperados divergentes recusam, sem recibo", async () => {
    await seedCopy(); const params = await copyParams(expected());
    await expect(copy({...params,expected_target_sha256:"a".repeat(64)})).rejects.toThrow(/expected_map_changed/);
    await expect(copy({...params,expected_source_count:"99"})).rejects.toThrow(/source_changed/);
    await expect(copy({...params,expected_target_count:"99"})).rejects.toThrow(/expected_map_changed/);
    expect(await counts()).toEqual([0,0,0]);
  });
  it.each(["divergent", "extra"] as const)("Q5 recusa alvo %s e não sobrescreve", async kind => {
    await seedCopy(); const params = await copyParams(expected()); await pct(kind === "extra" ? NONE : CHILD,"31");
    await expect(copy(params)).rejects.toThrow(/target_diverged/); expect(await counts()).toEqual([1,1,0]);
    expect(Number((await rows<{percentagem:string}>("SELECT percentagem FROM event_ticket_forecast_pct"))[0].percentagem)).toBe(31);
  });
  it("completa subconjunto exacto e preserva a outra empresa", async () => {
    await seedCopy(); const params = await copyParams(expected()); await pct(CHILD,"50"); await pct(FOREIGN,"18");
    const foreignBefore = await rows(`SELECT * FROM event_ticket_forecast_pct WHERE event_id='${FOREIGN}'`);
    await copy(params); expect(await counts()).toEqual([6,6,1]);
    expect(await rows(`SELECT * FROM event_ticket_forecast_pct WHERE event_id='${FOREIGN}'`)).toEqual(foreignBefore);
  });
  it("recibo não permite reaplicação após edição legítima ou exclusão no alvo", async () => {
    await seedCopy(); const params = await copyParams(expected()); await copy(params);
    await db.exec(`UPDATE event_ticket_forecast_pct SET percentagem=22 WHERE event_id='${CHILD}'`);
    await expect(copy(params)).rejects.toThrow(/receipt_or_target_diverged/);
    await db.exec(`DELETE FROM event_ticket_forecast_pct WHERE event_id='${CHILD}'`);
    await expect(copy(params)).rejects.toThrow(/receipt_or_target_diverged/);
  });
  it.each(["cycle", "parent_company", "scenario_company", "session_company", "ambiguous", "invalid"] as const)("recusa %s sem efeitos parciais", async kind => {
    await seedCopy();
    if (kind === "cycle") await db.exec(`UPDATE events SET parent_event_id='${CHILD}' WHERE id='${ROOT}'`);
    if (kind === "parent_company") await db.exec(`UPDATE events SET parent_event_id='${FOREIGN}' WHERE id='${CHILD}'`);
    if (kind === "scenario_company") await db.exec(`UPDATE event_coverage_scenarios SET company_id='${OTHER}' WHERE event_id='${ROOT}'`);
    if (kind === "session_company") await db.exec(`UPDATE event_sessions SET company_id='${OTHER}'`);
    if (kind === "ambiguous") await db.exec(`INSERT INTO event_sessions(company_id,event_id,date,sort_order) VALUES('${C}','${ROOT}','2099-01-01',1)`);
    // Fonte sintética com precisão divergente para provar que o DML nunca arredonda silenciosamente.
    if (kind === "invalid") {
      await db.exec("ALTER TABLE event_coverage_scenarios ALTER COLUMN percentagem TYPE numeric(6,3)");
      await db.exec(`UPDATE event_coverage_scenarios SET percentagem=50.001 WHERE event_id='${ROOT}'`);
    }
    const params = await copyParams(expected());
    await expect(copy(params)).rejects.toThrow(/copy_(cycle|parent_company_mismatch|company_or_version_mismatch|session_ambiguous|invalid_source|expected_map_changed)/);
    expect(await counts()).toEqual([0,0,0]);
    if (kind === "invalid") await db.exec("UPDATE event_coverage_scenarios SET percentagem=50; ALTER TABLE event_coverage_scenarios ALTER COLUMN percentagem TYPE numeric(5,2)");
  });
  it("falha no segundo INSERT reverte configurações, logs e recibo integralmente", async () => {
    await seedCopy(); const params = await copyParams(expected());
    await db.exec(`CREATE FUNCTION test_fail_mid_copy() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      IF NEW.event_id='${CHILD}' THEN RAISE EXCEPTION 'synthetic_mid_copy_failure'; END IF; RETURN NEW; END$$;
      CREATE TRIGGER zz_test_fail_mid_copy BEFORE INSERT ON event_ticket_forecast_pct FOR EACH ROW EXECUTE FUNCTION test_fail_mid_copy();`);
    await expect(copy(params)).rejects.toThrow(/synthetic_mid_copy_failure/); expect(await counts()).toEqual([0,0,0]);
    // Evita DDL destrutiva: o trigger sintético é desactivado após a prova.
    await db.exec("ALTER TABLE event_ticket_forecast_pct DISABLE TRIGGER zz_test_fail_mid_copy");
  });
  it("pós-condição detecta omissão de uma linha e reverte também recibo/logs", async () => {
    await seedCopy(); const params = await copyParams(expected());
    await db.exec(`CREATE FUNCTION test_omit_copy_line() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      IF NEW.event_id='${CHILD}' THEN RETURN NULL; END IF; RETURN NEW; END$$;
      CREATE TRIGGER zz_test_omit_copy_line BEFORE INSERT ON event_ticket_forecast_pct FOR EACH ROW EXECUTE FUNCTION test_omit_copy_line();`);
    await expect(copy(params)).rejects.toThrow(/copy_incomplete/); expect(await counts()).toEqual([0,0,0]);
    await db.exec("ALTER TABLE event_ticket_forecast_pct DISABLE TRIGGER zz_test_omit_copy_line");
  });
  it("Q5 detecta linha extra introduzida durante a cópia e reverte os dois sentidos do mapa", async () => {
    await seedCopy(); const params = await copyParams(expected());
    await db.exec(`CREATE FUNCTION test_extra_copy_line() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      IF NEW.event_id='${ROOT}' AND NEW.session_date IS NULL THEN
        INSERT INTO event_ticket_forecast_pct(event_id,percentagem) VALUES('${NONE}',31);
      END IF; RETURN NULL; END$$;
      CREATE TRIGGER zz_test_extra_copy_line AFTER INSERT ON event_ticket_forecast_pct FOR EACH ROW EXECUTE FUNCTION test_extra_copy_line();`);
    await expect(copy(params)).rejects.toThrow(/copy_incomplete/); expect(await counts()).toEqual([0,0,0]);
    await db.exec("ALTER TABLE event_ticket_forecast_pct DISABLE TRIGGER zz_test_extra_copy_line");
  });
});
