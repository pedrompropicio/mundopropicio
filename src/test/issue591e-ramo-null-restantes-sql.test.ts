// @vitest-environment node
// #591-e / 0329: PGlite descartável, sem rede, credenciais, deploy ou bases externas.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath = "drizzle/migrations/0329_issue591_ramo_null_restantes.sql";
const migration = read(migrationPath);
const rollback = read("supabase/manual/rollback_0329_issue591_ramo_null_restantes_comentado.sql");
const dml = read("supabase/manual/dml_0329_issue591_coala_decisions_company.sql");
const proof = read("docs/testes/issue591/prova-janela-0329-null.sql");
const auth = read("supabase/tests/issue335/live/phase2c-auth.sql");
const capture = (JSON.parse(read("supabase/tests/issue335/live/phase2h-catalog-ddl.json")) as {
  statements: { key: string; sql: string }[];
}).statements;
const one = (source: string, re: RegExp) => {
  const matches = source.match(re);
  if (matches?.length !== 1) throw new Error(`Esperada uma definição de ${re}: ${matches?.length ?? 0}`);
  return matches[0];
};
const fn = (source: string, name: string) => one(source, new RegExp(
  `CREATE (?:OR REPLACE )?FUNCTION ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?AS (\\$\\w*\\$)[\\s\\S]*?\\1;`, "g"));
const section = (source: string, name: string) => one(source,
  new RegExp(`-- >>> ${name}\\n[\\s\\S]*?-- <<< ${name}`, "g")).split("\n").slice(1, -1).join("\n");
const part1 = section(migration, "PARTE 1");
const part2 = section(migration, "PARTE 2");
const rollbackBody = section(rollback, "ROLLBACK").split("\n").map((l) => l.replace(/^-- /, "")).join("\n");
const uncomment = (s: string) => s.replace(/--[^\n]*/g, "").trim();
const captured = (key: string) => {
  const matches = capture.filter((s) => s.key === key);
  if (matches.length !== 1) throw new Error(`Captura ausente/ambígua: ${key}`);
  return matches[0].sql;
};
const retention = "crm.meta_creatives_retention_runs";
const decisions = "public.coala_sync_decisions";
const log = "public.tickets_v2_sync_log";
const tables = [retention, decisions, log];
const policies = capture.filter((s) => tables.some((t) => s.key.startsWith(`pol:${t}.`)));
const altered = policies.filter((s) => s.sql.includes("company_id IS NULL"));
const ticketSource = read("supabase/migrations/20260509212548_ade72c4e-8dfb-4dbb-b1c0-318a5693e4d5.sql");
const triggerSource = read("supabase/migrations/20260828075636_ef5260d3-c27a-4231-9474-84abdec1050e.sql");
const oldTrigger = fn(triggerSource, "public.tickets_v2_sync_lot");
const rbcc0326 = fn(read("supabase/manual/0326_issue591_rbcc_sem_ramo_null.sql"), "public.row_belongs_to_current_company");
const sourcePolicy = (source: string, name: string) => one(source,
  new RegExp(`CREATE POLICY (?:"${name}"|${name})\\s+[\\s\\S]*?;`, "g"));
const sourcePolicies = [
  ...["view", "insert", "update", "delete"].map((action) => sourcePolicy(
    read("supabase/migrations/20260525114600_71fedb8d-5436-4bf4-b827-4dcaf7327997.sql"), `Admin/manager ${action} sync decisions`)),
  ...["company_isolation_tickets_v2_sync_log", "Sync log viewable by admin/manager"].map((p) => sourcePolicy(ticketSource, p)),
  sourcePolicy(read("supabase/migrations/20260510163231_ee39b3fc-e1be-4fe8-8b07-4d5126ee11f3.sql"), "Sync log insertable by authenticated tenant"),
  ...["tenant_isolation_select", "service_role_bypass"].map((p) => sourcePolicy(
    read("supabase/migrations/20260920220454_fe6472d9-ea3b-413c-9dc1-bdda46fe986b.sql"), p)),
];
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const x = id(1), y = id(2), runX = id(301), runY = id(302), zoneX = id(401), zoneY = id(402);
const profiles = [
  { name: "admin X", uid: id(11), role: "admin" },
  { name: "manager X", uid: id(12), role: "manager" },
  { name: "accountant X", uid: id(13), role: "accountant" },
  { name: "sem papel", uid: id(14), role: null },
  { name: "platform_admin X", uid: id(15), role: "platform_admin" },
] as const;
const approvedDml = (n: number) => dml.replace("v_expected_count bigint := NULL;", `v_expected_count bigint := ${n};`);

describe("#591-e / 0329 — artefactos preparados", () => {
  it("critério 1: cópia byte a byte, sete ALTER POLICY e partes intercaladas com DML", () => {
    expect(readFileSync(migrationPath).equals(readFileSync("supabase/manual/0329_issue591_ramo_null_restantes.sql"))).toBe(true);
    expect(altered).toHaveLength(7);
    expect(uncomment(part1).match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(uncomment(part1)).not.toContain("ALTER POLICY");
    expect(uncomment(part1)).toContain("ALTER COLUMN company_id SET DEFAULT public.current_company_id()");
    expect(uncomment(part2).match(/ALTER POLICY/g)).toHaveLength(7);
    expect(uncomment(part2)).not.toMatch(/\b(CREATE|DROP|GRANT|REVOKE|UPDATE|INSERT|DELETE)\b/);
    for (const s of altered) {
      const m = s.sql.match(/CREATE POLICY ("[^"]+"|\w+) ON (\S+)/)!;
      expect(part2).toContain(`ALTER POLICY ${m[1]} ON ${m[2]}`);
    }
    for (const decision of ["6618640384", "6631476546", "6633832088", "6634415741"]) expect(migration).toContain(decision);
    expect(migration).toContain("parte 1 → DML → parte 2");
    expect(uncomment(part1.replace(fn(part1, "public.tickets_v2_sync_lot"), ""))).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
  });

  it("critérios 1–3: rollback todo comentado repõe sete políticas exactas e trigger; só o fallback mudou", () => {
    expect(rollback.split("\n").filter((l) => l && !l.startsWith("-- "))).toEqual([]);
    for (const p of altered) expect(rollbackBody).toContain(p.sql + ";");
    expect(rollbackBody.match(/CREATE POLICY/g)).toHaveLength(7);
    expect(rollbackBody).toContain(oldTrigger);
    // A captura omite o terminador SQL; o corpo da função tem de coincidir nos bytes.
    expect(oldTrigger.replace(/;$/, "").trim()).toBe(captured("fn:tickets_v2_sync_lot()").trim());
    expect(fn(part1, "public.tickets_v2_sync_lot")).toBe(oldTrigger.replace(
      "TG_OP, 'would_warn_orphan', NEW.id, v_event_id, NULL,",
      "TG_OP, 'would_warn_orphan', NEW.id, v_event_id, NEW.company_id,"));
    expect(captured("table:public.event_ticket_lots")).toContain("company_id uuid NOT NULL");
    expect(captured("table:public.coala_sync_runs")).toContain("company_id uuid NOT NULL");
    expect(capture.filter((s) => s.key === "default:public.coala_sync_decisions.company_id")).toEqual([]);
  });

  it("critério 1: prova §1–§3 exclusivamente SELECT/contexto e três identidades", () => {
    for (const s of ["§1", "§2", "§3"]) expect(proof).toContain(s);
    for (const s of uncomment(proof).split(";").map((s) => s.trim()).filter(Boolean)) {
      expect(s).toMatch(/^(SELECT\b|BEGIN$|SET LOCAL ROLE authenticated$|ROLLBACK$)/);
      expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\s+(INTO|FROM|TABLE|FUNCTION|POLICY|ON)/i);
    }
    for (const p of ["ADMIN", "MANAGER", "PEDRO"]) expect(proof).toContain(`'__${p}_UID__'`);
    expect(uncomment(proof).match(/ROLLBACK/g)).toHaveLength(3);
  });
});

describe.sequential("#591-e / 0329 — PostgreSQL/RLS real antes, depois e rollback", () => {
  let db: PGlite;
  const catalog = async () => (await db.query<{ policyname: string; [column: string]: unknown }>(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE (schemaname='public' AND tablename IN ('coala_sync_decisions','tickets_v2_sync_log'))
    OR (schemaname='crm' AND tablename='meta_creatives_retention_runs') ORDER BY 1,2,3`)).rows;
  const asUser = async <T>(uid: string, run: () => Promise<T>) => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await db.exec("SET LOCAL ROLE authenticated");
    try { return await run(); } finally { await db.exec("RESET ROLE"); }
  };
  const visible = (uid: string, table: string) => asUser(uid, async () =>
    (await db.query<{ company_id: string | null }>(`SELECT company_id FROM ${table} ORDER BY company_id NULLS LAST`)).rows.map((r) => r.company_id));
  const write = async (uid: string, sql: string): Promise<number | "rls_denied"> => {
    await db.exec("SAVEPOINT attempt");
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await db.exec("SET LOCAL ROLE authenticated");
      return (await db.query(sql)).affectedRows ?? 0;
    }
    catch (e) { expect((e as { code: string }).code).toBe("42501"); return "rls_denied"; }
    finally { await db.exec("ROLLBACK TO SAVEPOINT attempt; RELEASE SAVEPOINT attempt; RESET ROLE"); }
  };
  const matrix = async (p: typeof profiles[number], after: boolean) => {
    const result: unknown[] = [];
    const privileged = ["admin", "manager", "platform_admin"].includes(p.role ?? "");
    const pa = p.role === "platform_admin";
    for (const table of tables) {
      const expectedVisible: (string | null)[] = [];
      if (table === retention && p.role) expectedVisible.push(x);
      if (table !== retention && privileged) expectedVisible.push(x);
      if (table === decisions && pa) expectedVisible.push(y);
      if ((!after || pa) && (table === retention || privileged)) expectedVisible.push(null);
      const actual = await visible(p.uid, table);
      expect(actual, `${p.name} SELECT ${table}`).toEqual(expectedVisible);
      result.push(actual);
      for (const company of [x, y, null]) {
        const sqlCompany = company ? `'${company}'` : "NULL";
        const row = company === x ? id(101) : company === y ? id(102) : id(103);
        const insert = table === decisions
          ? `INSERT INTO ${table}(id,run_id,config_id,company_id,row_key,diff_kind,decision) VALUES ('${id(999)}','${runX}','${id(500)}',${sqlCompany},'new','value_mismatch','validate')`
          : `INSERT INTO ${table}(company_id) VALUES (${sqlCompany})`;
        const allowedInsert = table === decisions ? privileged && (pa || company === x || (!after && company === null))
          : table === log && (company === null ? !after : company === x && p.role !== null);
        expect(await write(p.uid, insert), `${p.name} INSERT ${table} ${company}`).toBe(allowedInsert ? 1 : "rls_denied");
        for (const sql of [`UPDATE ${table} SET company_id=company_id WHERE id='${row}'`, `DELETE FROM ${table} WHERE id='${row}'`]) {
          const measured = await write(p.uid, sql);
          const expected = table === retention ? "rls_denied" : table === decisions && expectedVisible.includes(company) ? 1 : 0;
          expect(measured, `${p.name} ${sql}`).toBe(expected);
          result.push(measured);
        }
      }
      const toNull = await write(p.uid, `UPDATE ${table} SET company_id=NULL WHERE id='${id(101)}'`);
      expect(toNull).toBe(table === retention ? "rls_denied" : table !== decisions || !privileged ? 0 : !after || pa ? 1 : "rls_denied");
      result.push(toNull);
    }
    return result;
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA crm;
      ${captured("type:public.app_role")};
      CREATE TABLE public.companies(id uuid PRIMARY KEY, status text NOT NULL, tickets_config jsonb DEFAULT '{}', feature_tickets_v2 boolean DEFAULT false);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, company_id uuid, active_company_id uuid);
      CREATE TABLE public.user_roles(id uuid PRIMARY KEY, user_id uuid NOT NULL, company_id uuid, role app_role NOT NULL);
      INSERT INTO public.companies(id,status) VALUES ('${x}','active'),('${y}','active');
      GRANT USAGE ON SCHEMA auth,public,crm TO authenticated,service_role;
      SELECT set_config('request.jwt.claims','{}',false);
      SELECT set_config('request.jwt.claim.role','authenticated',false);`);
    for (const name of ["auth.uid", "auth.role", "public.is_platform_admin", "public.current_company_id", "public.has_role", "public.has_staff_role"]) await db.exec(fn(auth, name));
    await db.exec(rbcc0326);
    await db.exec(`CREATE TABLE public.coala_sync_runs(id uuid PRIMARY KEY, company_id uuid NOT NULL);
      INSERT INTO public.coala_sync_runs VALUES ('${runX}','${x}'),('${runY}','${y}');`);
    await db.exec(captured("table:public.coala_sync_decisions"));
    for (const col of ["id", "decided_at"]) await db.exec(captured(`default:public.coala_sync_decisions.${col}`));
    await db.exec(`ALTER TABLE ${decisions} ADD PRIMARY KEY(id), ADD UNIQUE(run_id,row_key,diff_kind), ADD FOREIGN KEY(run_id) REFERENCES public.coala_sync_runs(id);
      CREATE TABLE ${retention}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid);
      CREATE TABLE ${log}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,event_id uuid,lot_id uuid,operation text,trigger_action text,
        proposed_type_id uuid,proposed_type_name text,proposed_zone_signature uuid[],matched_via text,warnings text[],context jsonb,sync_mode text);`);
    for (const table of tables) {
      await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT ON ${table} TO authenticated; GRANT ALL ON ${table} TO service_role`);
      if (table !== retention) await db.exec(`GRANT INSERT,UPDATE,DELETE ON ${table} TO authenticated`);
      for (const [i, company] of [x, y, null].entries()) {
        const cols = table === decisions ? ",run_id,config_id,row_key,diff_kind,decision" : "";
        const vals = table === decisions ? `,'${i === 1 ? runY : runX}','${id(500)}','row${i}','value_mismatch','validate'` : "";
        await db.query(`INSERT INTO ${table}(id,company_id${cols}) VALUES ($1,$2${vals})`, [id(101+i), company]);
      }
    }
    for (const p of policies) await db.exec(p.sql);
    for (const [i,p] of profiles.entries()) {
      await db.query("INSERT INTO public.profiles VALUES ($1,$2,$2)", [p.uid,x]);
      if (p.role) await db.query("INSERT INTO public.user_roles VALUES ($1,$2,$3,$4)", [id(201+i),p.uid,p.role === "platform_admin" ? null : x,p.role]);
    }
    // Apoio ao trigger: tipos mínimos, políticas reais de escrita do lote e leitura da zona.
    await db.exec(`CREATE TABLE public.event_ticket_zones(id uuid PRIMARY KEY,event_id uuid,company_id uuid NOT NULL,name text,session_id uuid);
      CREATE TABLE public.event_ticket_lots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL DEFAULT public.current_company_id(),zone_id uuid NOT NULL,
        name text DEFAULT 'Geral',ticket_type_id uuid,is_combo boolean DEFAULT false,consumes_zone_ids uuid[] DEFAULT '{}',applies_to_days integer DEFAULT 1,version_id uuid);
      CREATE TABLE public.event_sessions(id uuid,label text);
      CREATE TABLE public.event_ticket_types(id uuid DEFAULT gen_random_uuid(),event_id uuid,company_id uuid,name text,kind text,entries_per_unit integer,max_total_quantity integer,
        parent_ticket_type_id uuid,variant_kind text,variant_label text,visibility text,version_id uuid);
      CREATE UNIQUE INDEX types_name ON public.event_ticket_types(event_id,name,COALESCE(version_id,'00000000-0000-0000-0000-000000000000'::uuid));
      CREATE TABLE public.event_ticket_type_zones(ticket_type_id uuid,zone_id uuid,display_order integer,price_share numeric,company_id uuid,UNIQUE(ticket_type_id,zone_id));
      ALTER TABLE public.event_ticket_zones ENABLE ROW LEVEL SECURITY; ALTER TABLE public.event_ticket_lots ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.companies,public.event_ticket_zones,public.event_sessions,public.event_ticket_types,public.event_ticket_type_zones TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_ticket_lots TO authenticated;
      INSERT INTO public.event_ticket_zones VALUES ('${zoneX}','${id(601)}','${x}','X',NULL),('${zoneY}','${id(602)}','${y}','Y',NULL);`);
    for (const table of ["event_ticket_lots", "event_ticket_zones"]) {
      await db.exec(captured(`pol:public.${table}.company_isolation_${table}`));
    }
    for (const p of ["Ticket lots insertable by privileged roles", "Ticket lots updatable by privileged roles", "Ticket lots deletable by admin or manager"]) await db.exec(captured(`pol:public.event_ticket_lots.${p}`));
    await db.exec(captured("pol:public.event_ticket_zones.event_ticket_zones_select_privileged_roles"));
    // A política de SELECT dos lotes depende de helpers fora deste recorte; o DELETE é provado sem WHERE.
    await db.exec(fn(read("supabase/migrations/20260429033756_e6cf356e-f8e8-45c5-ade9-6c4f626499b7.sql"), "public.set_company_id_on_insert"));
    await db.exec(captured("trg:public.event_ticket_lots.trg_set_company_id"));
    await db.exec(fn(ticketSource, "public.compute_ticket_type_for_lot"));
    await db.exec(oldTrigger);
    await db.exec(captured("trg:public.event_ticket_lots.trg_tickets_v2_sync"));
    // Falhar a fixture se a fonte mais recente + transformação InitPlan divergir da captura.
    const expected = await catalog();
    for (const sql of sourcePolicies) {
      const m = sql.match(/CREATE POLICY ("[^"]+"|\w+)\s+ON (\S+)/)!;
      await db.exec(`DROP POLICY ${m[1]} ON ${m[2]}; ${sql}`);
    }
    await db.exec(read("supabase/migrations/20260914223845_856916d8-c1c9-45b8-8d42-28cb4bb820dc.sql"));
    expect(await catalog(), "Divergência fonte/captura: parar a preparação").toEqual(expected);
  }, 60000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("ROLLBACK; RESET ROLE"); });

  it("critério 2: nove políticas fiéis, sete alteradas e rbcc da 0326 com NULL=false", async () => {
    expect(await catalog()).toHaveLength(9);
    for (const p of profiles) expect(await asUser(p.uid, async () =>
      (await db.query("SELECT public.row_belongs_to_current_company(NULL) AS belongs")).rows)).toEqual([{ belongs: false }]);
    const before = await catalog();
    const defaultCompany = async () => (await db.query<{column_default:string|null}>(`SELECT column_default
      FROM information_schema.columns WHERE table_schema='public' AND table_name='coala_sync_decisions' AND column_name='company_id'`)).rows[0].column_default;
    expect(await defaultCompany()).toBeNull();
    await db.exec(migration);
    expect(await defaultCompany()).toBe('current_company_id()');
    const after = await catalog();
    expect(after.filter((p,i) => JSON.stringify(p) !== JSON.stringify(before[i]))).toHaveLength(7);
    for (const name of ["service_role_bypass", "Sync log viewable by admin/manager"]) expect(after.find((p) => p.policyname === name)).toEqual(before.find((p) => p.policyname === name));
    await db.exec(rollbackBody);
    expect(await catalog()).toEqual(before);
    expect(await defaultCompany()).toBeNull();
  });

  it.each(profiles)("critério 3: matriz SELECT/INSERT/UPDATE/DELETE X/Y/NULL antes/depois/rollback — $name", async (p) => {
    const before = await matrix(p, false);
    await db.exec(migration);
    await matrix(p, true);
    await db.exec(rollbackBody);
    expect(await matrix(p, false)).toEqual(before);
  });

  it("critério 3: payload actual Coala sem company_id usa empresa activa e upsert continua visível", async () => {
    const payloadSource = one(read("src/pages/admin/CoalaSync.tsx"), /const row = \{\n\s+run_id: run.id,[\s\S]*?\n      \};/g);
    expect(payloadSource).not.toContain("company_id");
    await db.exec(migration);
    await asUser(profiles[0].uid, async () => {
      for (const decision of ["validate", "ignore"]) await db.query(`INSERT INTO ${decisions}
        (run_id,config_id,row_key,diff_kind,decision,custom_amount,notes,decided_by,decided_at)
        VALUES ($1,$2,'ui','value_mismatch',$3,NULL,NULL,$4,now())
        ON CONFLICT(run_id,row_key,diff_kind) DO UPDATE SET decision=EXCLUDED.decision`, [runX,id(500),decision,profiles[0].uid]);
      expect((await db.query(`SELECT company_id,decision FROM ${decisions} WHERE row_key='ui'`)).rows).toEqual([{company_id:x,decision:"ignore"}]);
    });
  });

  it("critério 3 / levantamento a: lote X com zona Y invisível grava X; DELETE conserva OLD.company_id", async () => {
    const p = profiles[0];
    const insert = `INSERT INTO public.event_ticket_lots(id,company_id,zone_id) VALUES ('${id(701)}','${x}','${zoneY}')`;
    expect(await write(p.uid,insert)).toBe(1);
    await db.exec(migration);
    await asUser(p.uid, async () => {
      expect((await db.query(`SELECT id FROM public.event_ticket_zones WHERE id='${zoneY}'`)).rows).toEqual([]);
      await db.exec(insert);
      await db.exec("UPDATE public.event_ticket_lots SET name='alterado'");
    });
    expect(await write(p.uid, "UPDATE public.event_ticket_lots SET company_id=NULL")).toBe("rls_denied");
    await asUser(p.uid, async () => {
      // Sem filtro/RETURNING: a permissão real de DELETE não requer a política SELECT alheia ao recorte.
      await db.exec("DELETE FROM public.event_ticket_lots");
    });
    expect((await db.query(`SELECT company_id,trigger_action,warnings FROM ${log} WHERE lot_id='${id(701)}' ORDER BY operation DESC`)).rows).toEqual([
      {company_id:x,trigger_action:"would_warn_orphan",warnings:["cannot_resolve_company"]},
      {company_id:x,trigger_action:"would_warn_orphan",warnings:["cannot_resolve_company"]},
      {company_id:x,trigger_action:"would_unlink",warnings:null},
    ]);
    const info = (await db.query<{prosecdef:boolean}>("SELECT prosecdef,proacl,proconfig FROM pg_proc WHERE oid='public.tickets_v2_sync_lot()'::regprocedure")).rows;
    await db.exec(rollbackBody);
    expect((await db.query("SELECT prosecdef,proacl,proconfig FROM pg_proc WHERE oid='public.tickets_v2_sync_lot()'::regprocedure")).rows).toEqual(info);
    expect(info[0].prosecdef).toBe(false);
  });

  it("critério 3 / levantamento a: todos os INSERTs do trigger preservam empresa, incluindo default e heurística real", async () => {
    await db.exec(migration);
    await db.exec(`INSERT INTO public.event_ticket_types(id,event_id,company_id,name) VALUES ('${id(800)}','${id(601)}','${x}','Geral')`);
    await asUser(profiles[0].uid, async () => {
      for (const [i,type,zone] of [[1,id(800),zoneX],[2,id(801),zoneX],[3,null,zoneX],[4,null,zoneY]] as const)
        await db.query(`INSERT INTO public.event_ticket_lots(id,zone_id,ticket_type_id) VALUES ($1,$2,$3)`, [id(710+i),zone,type]);
      // NEW NULL explícito também é preenchido pelo trigger já existente, anterior alfabeticamente.
      await db.query("INSERT INTO public.event_ticket_lots(id,company_id,zone_id) VALUES ($1,NULL,$2)",[id(720),zoneY]);
    });
    const rows = (await db.query<{company_id:string;trigger_action:string}>(`SELECT company_id,trigger_action FROM ${log} WHERE lot_id IS NOT NULL ORDER BY lot_id`)).rows;
    expect(rows.map((r) => r.company_id)).toEqual([x,x,x,x,x]);
    expect(rows.map((r) => r.trigger_action)).toEqual(["would_skip_explicit_id","would_warn_invalid_type","would_create_type","would_warn_orphan","would_warn_orphan"]);
  });

  it("critério 3: DML atribui pela corrida, preserva não-NULL e deixa contagem final zero", async () => {
    await db.exec(part1);
    await db.exec(`INSERT INTO ${decisions}(run_id,config_id,row_key,diff_kind,decision) VALUES ('${runY}','${id(500)}','nullY','value_mismatch','validate')`);
    const result = await db.exec(approvedDml(2));
    expect(result.flatMap((r) => r.rows).filter((r) => "null_restantes_esperado_zero" in r)).toEqual([{null_restantes_esperado_zero:0}]);
    expect((await db.query(`SELECT company_id FROM ${decisions} WHERE row_key='nullY'`)).rows).toEqual([{company_id:y}]);
    expect((await db.query(`SELECT company_id FROM ${decisions} WHERE id='${id(103)}'`)).rows).toEqual([{company_id:x}]);
    expect((await db.query(`SELECT company_id FROM ${decisions} WHERE id='${id(102)}'`)).rows).toEqual([{company_id:y}]);
    await db.exec(part2);
    expect(await visible(profiles[0].uid, decisions)).toEqual([x,x]);
  });

  it.each([null,0,2])("critério 3: DML falha fechado sem contagem aprovada ou com contagem errada (%s)", async (count) => {
    await db.exec(part1);
    await db.exec("SAVEPOINT bad_count");
    await expect(db.exec(count === null ? dml : approvedDml(count))).rejects.toMatchObject({code:"P0001"});
    await db.exec("ROLLBACK TO SAVEPOINT bad_count; RELEASE SAVEPOINT bad_count");
    expect((await db.query(`SELECT count(*) AS n FROM ${decisions} WHERE company_id IS NULL`)).rows).toEqual([{n:1}]);
  });

  it("critério 3: DML sem corrida correspondente faz rollback integral do preenchimento", async () => {
    await db.exec(part1);
    await db.exec(`ALTER TABLE ${decisions} DROP CONSTRAINT coala_sync_decisions_run_id_fkey;
      INSERT INTO ${decisions}(run_id,config_id,row_key,diff_kind,decision) VALUES ('${id(999)}','${id(500)}','orphan','value_mismatch','validate')`);
    await db.exec("SAVEPOINT orphan");
    await expect(db.exec(approvedDml(2))).rejects.toMatchObject({code:"P0001"});
    await db.exec("ROLLBACK TO SAVEPOINT orphan; RELEASE SAVEPOINT orphan");
    expect((await db.query(`SELECT count(*) AS n FROM ${decisions} WHERE company_id IS NULL`)).rows).toEqual([{n:2}]);
  });

  it("critério 3: service_role continua a escrever e ler retenção NULL", async () => {
    await db.exec(migration);
    await db.exec("SET LOCAL ROLE service_role");
    await db.exec(`INSERT INTO ${retention}(company_id) VALUES (NULL)`);
    expect((await db.query(`SELECT count(*) AS n FROM ${retention} WHERE company_id IS NULL`)).rows).toEqual([{n:2}]);
    await db.exec("RESET ROLE");
  });

  it("critérios 1–3: prova SELECT inteira executa antes/depois e mede as três identidades", async () => {
    await db.exec("COMMIT");
    const prepared = proof.replaceAll("__ADMIN_UID__",profiles[0].uid).replaceAll("__MANAGER_UID__",profiles[1].uid).replaceAll("__PEDRO_UID__",profiles[4].uid);
    const measure = async () => (await db.exec(prepared)).flatMap((r) => r.rows).filter((r) => "null_visiveis" in r);
    try {
      const before = await measure();
      expect(before.map((r) => r.null_visiveis)).toEqual([1,1,1,1,1,1,1,1,1]);
      await db.exec(migration);
      const after = await measure();
      expect(after.map((r) => r.null_visiveis)).toEqual([0,0,0,0,0,0,1,1,1]);
      expect(after.map((r) => [r.tabela,r.com_empresa,r.activa,r.outra])).toEqual(before.map((r) => [r.tabela,r.com_empresa,r.activa,r.outra]));
    } finally { await db.exec(rollbackBody); await db.exec("BEGIN"); }
  });
});
