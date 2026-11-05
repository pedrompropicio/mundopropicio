// @vitest-environment node
// SQL apenas em PGlite descartável, com dados sintéticos e sem credenciais/rede.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0328_issue202_backup_exclusoes_retencao.sql";
const manualPath = "supabase/manual/0328_issue202_backup_exclusoes_retencao.sql";
const rollbackPath = "supabase/manual/rollback_0328_issue202_backup_exclusoes_retencao_comentado.sql";
const proofPath = "docs/testes/issue202/prova-janela-0328.sql";
const cronPath = "supabase/manual/cron_song_link_retention_live.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8").split("\n").map((line) => line.replace(/^-- /, "")).join("\n");
const proof = readFileSync(proofPath, "utf8");
const activeSql = (sql: string) => sql.replace(/--[^\n]*/g, "");
const purges = [
  { table: "song_link_diag", key: "id", column: "created_at", fn: "purge_song_link_diag", window: 14, min: 7, unit: "days", hours: 336 },
  { table: "song_link_delivery_slots", key: "arrival_event_id", column: "delivered_at", fn: "purge_song_link_delivery_slots", window: 30, min: 14, unit: "days", hours: 720 },
  { table: "ip_geo_cache", key: "ip", column: "resolved_at", fn: "purge_ip_geo_cache", window: 72, min: 24, unit: "hours", hours: 72 },
] as const;
let db: PGlite;

async function stableClock(run: () => Promise<void>) {
  await db.exec("BEGIN");
  try { await run(); } finally { await db.exec("ROLLBACK"); }
}
const exclusions = async () => (await db.query<{ schema_name: string; table_name: string; reason: string }>(
  "SELECT * FROM public.backup_excluded_tables ORDER BY schema_name, table_name",
)).rows;
const reference = async () => (await db.query<{ reference_count: number }>("SELECT reference_count FROM public.system_invariants WHERE name='backup_tabelas_excluidas'")).rows[0]?.reference_count;
const retained = async () => (await db.exec("SELECT * FROM public.song_link_events; SELECT * FROM public.song_link_report_daily; SELECT * FROM public.song_link_report_visitor_daily")).map((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE public_probe;
    CREATE TABLE public.backup_excluded_tables(schema_name text, table_name text, reason text, PRIMARY KEY(schema_name, table_name));
    CREATE TABLE public.system_invariants(name text PRIMARY KEY, reference_count bigint);
    CREATE TABLE public.song_link_diag(id text PRIMARY KEY, created_at timestamptz NOT NULL);
    CREATE TABLE public.song_link_delivery_slots(
      arrival_event_id text, provider text DEFAULT 'meta', event_name text DEFAULT 'ListenClick',
      reserved_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
      status text DEFAULT 'reserved', PRIMARY KEY(arrival_event_id, provider, event_name));
    CREATE TABLE public.ip_geo_cache(ip text PRIMARY KEY, resolved_at timestamptz NOT NULL);
    CREATE TABLE public.ip_city_ranges(id integer PRIMARY KEY);
    CREATE TABLE public.song_link_events(id integer PRIMARY KEY, created_at timestamptz);
    CREATE TABLE public.song_link_report_daily(id integer PRIMARY KEY);
    CREATE TABLE public.song_link_report_visitor_daily(id integer PRIMARY KEY);
    INSERT INTO public.song_link_events VALUES (1, '2000-01-01');
    INSERT INTO public.song_link_report_daily VALUES (1);
    INSERT INTO public.song_link_report_visitor_daily VALUES (1);
    INSERT INTO public.ip_city_ranges VALUES (1);
  `);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`
    DROP FUNCTION IF EXISTS public.purge_song_link_diag(integer, integer);
    DROP FUNCTION IF EXISTS public.purge_song_link_delivery_slots(integer, integer);
    DROP FUNCTION IF EXISTS public.purge_ip_geo_cache(integer, integer);
    TRUNCATE public.backup_excluded_tables, public.system_invariants,
      public.song_link_diag, public.song_link_delivery_slots, public.ip_geo_cache;
    INSERT INTO public.backup_excluded_tables
      SELECT 'public', 'synthetic_legacy_'||i, 'fixture' FROM generate_series(1,6) i;
    INSERT INTO public.backup_excluded_tables VALUES ('crm', 'ip_geo_cache', 'outro schema preservado');
    INSERT INTO public.system_invariants VALUES ('backup_tabelas_excluidas',7), ('outro_invariante',99);
  `);
  await db.exec(migration);
});

describe.sequential("#202 E2b 0328 — exclusões e retenção preparadas", () => {
  it("critério 3: migração, cópia e crons não apagam song_link_events nem outras tabelas retidas", () => {
    for (const path of [migrationPath, manualPath, cronPath]) {
      const sql = activeSql(readFileSync(path, "utf8"));
      const targets = [...sql.matchAll(/\bDELETE\s+FROM\s+([\w.]+)/gi)].map((m) => m[1]);
      expect(targets).toEqual(path === cronPath ? [] : purges.map((p) => `public.${p.table}`));
      expect(sql).not.toMatch(/\b(?:song_link_events|song_link_report_\w+)\b/i);
    }
  });

  it("crons preparados usam SQL directo, uma chamada por lote e minutos livres do inventário", () => {
    const cron = readFileSync(cronPath, "utf8");
    expect(cron).toContain("aplicar só depois da 0328, pelo 0, com Sim");
    expect(cron).toContain("PREPARAÇÃO PARCIAL");
    const jobs = [...activeSql(cron).matchAll(/cron\.schedule\('([^']+)', '([^']+)', \$cmd\$\s*(SELECT public\.\w+\(\);)\s*\$cmd\$\)/g)];
    expect(jobs.map((j) => j[3])).toEqual([
      "SELECT public.purge_song_link_diag();",
      "SELECT public.purge_song_link_delivery_slots();",
    ]);
    const inventory = JSON.parse(readFileSync("docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json", "utf8")) as { proposals: { schedule: string }[] };
    const expand = (field: string) => field.split(",").flatMap((part) => {
      const [range, stride] = part.split("/");
      const step = stride ? Number(stride) : 1;
      const [lo, hi] = range === "*" ? [0, 59]
        : range.includes("-") ? range.split("-").map(Number) : [Number(range), Number(range)];
      return Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
    });
    const usedMinutes = new Set(inventory.proposals.flatMap((r) => expand(r.schedule.split(" ")[0])));
    for (const [, name, schedule] of jobs) {
      const [minute, hour, ...calendar] = schedule.split(" ");
      expect(usedMinutes.has(Number(minute))).toBe(false);
      expect(Number(hour) < 6 || Number(hour) > 9).toBe(true);
      expect(calendar).toEqual(["*", "*", "*"]);
      expect(cron).toContain(`-- SELECT cron.unschedule('${name}');`);
    }
    expect(activeSql(cron)).not.toMatch(/net\.http_post|cron\.unschedule|\b(?:DO|CALL|DELETE)\b/i);
  });

  it("critério 1: cópia byte a byte, rollback inteiramente comentado e prova só SELECT", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim");
    expect(migration).toContain("6621085645");
    expect(migration).toContain("6633703391");
    expect(migration).toContain("6634413910");
    expect(migration).toContain("depois de um global ok com o 202-d");
    expect(readFileSync(rollbackPath, "utf8").trimEnd().split("\n").every((line) => line.startsWith("-- "))).toBe(true);
    const statements = activeSql(proof).split(";").filter((s) => s.trim());
    expect(statements).toHaveLength(6);
    expect(statements.every((s) => /^SELECT\b/i.test(s.trim()))).toBe(true);
    expect(activeSql(proof)).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|DO|CALL)\b/i);
    expect(activeSql(migration)).not.toMatch(/cron\.(?:schedule|unschedule)|net\.http_post/i);
  });

  it("critério 2: só quatro exclusões, motivos literais e referência 7→11", async () => {
    expect(await reference()).toBe(11);
    expect(await exclusions()).toHaveLength(11);
    expect((await exclusions()).filter((r) => r.reason !== "fixture" && r.schema_name === "public")).toEqual([
      { schema_name: "public", table_name: "ip_city_ranges", reason: "DB-IP, recarregada todos os meses pelo cron carreira-dbip-city-mensal" },
      { schema_name: "public", table_name: "ip_geo_cache", reason: "cache" },
      { schema_name: "public", table_name: "song_link_delivery_slots", reason: "controlo de entrega" },
      { schema_name: "public", table_name: "song_link_diag", reason: "telemetria" },
    ]);
    expect((await db.query("SELECT reference_count FROM public.system_invariants WHERE name='outro_invariante'")).rows).toEqual([{ reference_count: 99 }]);
    expect((await exclusions()).some((r) => String(r.table_name).startsWith("song_link_report_"))).toBe(false);
  });

  it("critério 2: INSERT repetido não duplica; reexecução integral recusa 11 e preserva tudo", async () => {
    const before = await exclusions();
    const insert = activeSql(migration).match(/INSERT INTO public\.backup_excluded_tables[\s\S]*?DO NOTHING;/)![0];
    await db.exec(insert);
    expect(await exclusions()).toEqual(before);
    await expect(db.exec(migration)).rejects.toThrow(/0328: conferir.*Live.*esperado 7/);
    await db.exec("ROLLBACK");
    expect(await exclusions()).toEqual(before);
    expect(await reference()).toBe(11);
  });

  it.each([8, null])("critério 2: referência %s aborta atomicamente sem instalar funções", async (count) => {
    await db.exec(rollback);
    await db.exec(count === null
      ? "DELETE FROM public.system_invariants WHERE name='backup_tabelas_excluidas'"
      : `UPDATE public.system_invariants SET reference_count=${count} WHERE name='backup_tabelas_excluidas'`);
    const before = await exclusions();
    await expect(db.exec(migration)).rejects.toThrow(/0328: conferir.*Live.*esperado 7/);
    await db.exec("ROLLBACK");
    expect(await exclusions()).toEqual(before);
    expect(await reference()).toBe(count ?? undefined);
    for (const { fn } of purges) {
      expect((await db.query(`SELECT to_regprocedure('public.${fn}(integer,integer)') f`)).rows).toEqual([{ f: null }]);
    }
  });

  for (const p of purges) {
    it(`critério 2: ${p.fn} usa a janela por omissão e preserva a fronteira exacta`, async () => {
      const before = await retained();
      await stableClock(async () => {
        await db.exec(`INSERT INTO public.${p.table} (${p.key},${p.column}) VALUES
          ('expired',now()-make_interval(hours=>${p.hours})-interval '1 second'),
          ('boundary',now()-make_interval(hours=>${p.hours})),
          ('fresh',now()-make_interval(hours=>${p.hours})+interval '1 second')`);
        expect((await db.query(`SELECT public.${p.fn}() n`)).rows).toEqual([{ n: 1 }]);
        expect((await db.query(`SELECT ${p.key} k FROM public.${p.table} ORDER BY k`)).rows).toEqual([{ k: "boundary" }, { k: "fresh" }]);
        expect((await db.query(`SELECT public.${p.fn}() n`)).rows).toEqual([{ n: 0 }]);
        expect(await retained()).toEqual(before);
        expect((await db.query("SELECT * FROM public.ip_city_ranges")).rows).toEqual([{ id: 1 }]);
      });
    });

    it(`critério 2: ${p.fn} limita p_batch e devolve o número real em cada chamada`, async () => {
      await db.exec(`INSERT INTO public.${p.table} (${p.key},${p.column})
        SELECT i::text, now()-interval '90 days' FROM generate_series(1,5) i`);
      for (const n of [2, 2, 1, 0]) {
        expect((await db.query(`SELECT public.${p.fn}(${p.window},2) n`)).rows).toEqual([{ n }]);
      }
      const defaults = (await db.query<{ defaults: string }>(`SELECT pg_get_expr(proargdefaults,0) defaults
        FROM pg_proc WHERE oid='public.${p.fn}(integer,integer)'::regprocedure`)).rows[0].defaults;
      expect(defaults).toBe(`${p.window}, 50000`);
    });

    it(`critério 2: ${p.fn} recusa retenção inferior/nula e lotes inválidos; aceita o mínimo`, async () => {
      for (const retention of [String(p.min - 1), "0", "-1", "NULL"]) {
        await expect(db.query(`SELECT public.${p.fn}(${retention})`)).rejects.toThrow(/Retenção mínima/);
      }
      for (const batch of ["NULL", "0", "-1"]) {
        await expect(db.query(`SELECT public.${p.fn}(${p.window},${batch})`)).rejects.toThrow(/p_batch/);
      }
      await db.exec(`INSERT INTO public.${p.table} (${p.key},${p.column}) VALUES
        ('older-than-minimum',now()-make_interval(${p.unit}=>${p.min})-interval '1 hour')`);
      expect((await db.query(`SELECT public.${p.fn}(${p.min},1) n`)).rows).toEqual([{ n: 1 }]);
    });
  }

  it("critério 2: slots sem delivered_at ficam sempre, qualquer status e idade de reserved_at", async () => {
    await db.exec(`INSERT INTO public.song_link_delivery_slots(arrival_event_id,status,reserved_at)
      SELECT s,s,now()-interval '365 days' FROM unnest(ARRAY['reserved','delivered','failed','unknown']) s;
      INSERT INTO public.song_link_delivery_slots(arrival_event_id,status,reserved_at,delivered_at) VALUES
        ('old-delivery','unknown',now(),now()-interval '31 days'),
        ('recent-delivery','delivered',now()-interval '365 days',now()-interval '29 days')`);
    expect((await db.query("SELECT public.purge_song_link_delivery_slots() n")).rows).toEqual([{ n: 1 }]);
    expect((await db.query("SELECT count(*) n FROM public.song_link_delivery_slots WHERE delivered_at IS NULL")).rows).toEqual([{ n: 4 }]);
    expect((await db.query("SELECT arrival_event_id FROM public.song_link_delivery_slots WHERE delivered_at IS NOT NULL")).rows).toEqual([{ arrival_event_id: "recent-delivery" }]);
    expect((await db.query("SELECT public.purge_song_link_delivery_slots(14,1) n")).rows).toEqual([{ n: 1 }]);
    expect((await db.query("SELECT public.purge_song_link_delivery_slots(14,1) n")).rows).toEqual([{ n: 0 }]);
  });

  it("critério 2: SECDEF com search_path public, comentário e EXECUTE só service_role", async () => {
    for (const { fn } of purges) {
      expect((await db.query(`SELECT p.prosecdef, p.proconfig,
        obj_description(p.oid,'pg_proc') IS NOT NULL AS commented,
        has_function_privilege('anon',p.oid,'EXECUTE') a,
        has_function_privilege('authenticated',p.oid,'EXECUTE') b,
        has_function_privilege('service_role',p.oid,'EXECUTE') c,
        has_function_privilege('public_probe',p.oid,'EXECUTE') d
        FROM pg_proc p WHERE p.oid='public.${fn}(integer,integer)'::regprocedure`)).rows)
        .toEqual([{ prosecdef: true, proconfig: ["search_path=public"], commented: true, a: false, b: false, c: true, d: false }]);
      for (const role of ["anon", "authenticated", "public_probe"]) {
        await db.exec(`SET ROLE ${role}`);
        try { await expect(db.query(`SELECT public.${fn}()`)).rejects.toThrow(/permission denied/); }
        finally { await db.exec("RESET ROLE"); }
      }
      await db.exec("SET ROLE service_role");
      try { expect((await db.query(`SELECT public.${fn}() n`)).rows).toEqual([{ n: 0 }]); }
      finally { await db.exec("RESET ROLE"); }
    }
  });

  it("critério 2: rollback descomentado repõe exclusões/referência/funções; prova corre antes e depois", async () => {
    const before = await retained();
    await db.exec(rollback);
    expect(await exclusions()).toHaveLength(7);
    expect(await reference()).toBe(7);
    expect((await exclusions()).find((r) => r.schema_name === "crm")).toEqual({ schema_name: "crm", table_name: "ip_geo_cache", reason: "outro schema preservado" });
    const baseline = await exclusions();
    expect((await db.exec(proof))[5].rows).toEqual([]);
    await db.exec(migration);
    const result = await db.exec(proof);
    expect(result[0].rows).toEqual([{ exclusoes_totais: 11, reference_count: 11 }]);
    expect(result[5].rows).toHaveLength(3);
    for (const row of result[5].rows) expect(row).toMatchObject({ prosecdef: true, anon_execute: false, authenticated_execute: false, service_role_execute: true, public_execute: false });
    await db.exec(rollback);
    expect(await exclusions()).toEqual(baseline);
    expect(await retained()).toEqual(before);
  });
});
