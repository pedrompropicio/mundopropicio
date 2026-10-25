import { describe, expect, it } from "vitest";
import { applyCaptureDay, resolveCaptureMapping, type CaptureRow, type CaptureTarget, type CaptureParsed } from "../../supabase/functions/_shared/ticketline-capture-mapping";

const day = "2026-10-24";
const target = (id: string, code: string | null, extra: Partial<CaptureTarget> = {}): CaptureTarget => ({
  id, event_id: `event-${id}`, company_id: "synthetic-company", ticketline_report_codes: code,
  daily_fallback_active: false, promotores_migrated_at: null, ...extra,
});
const row = (label: string, codes: string | null, qty = 3, value = 90): CaptureRow => ({ label, codes, qty, value });
const report = (rows: CaptureRow[]): CaptureParsed => ({ rows, totalRow: {
  qty: rows.reduce((s, r) => s + r.qty, 0), value: rows.reduce((s, r) => s + r.value, 0),
} });
type Sale = { company_id: string; event_id: string; sale_date: string; quantity: number; total_value: number };
function fakeAdmin(targets: CaptureTarget[]) {
  const sales = targets.map(t => ({ company_id: t.company_id, event_id: t.event_id, sale_date: day, quantity: 77, total_value: 770 }));
  const upserts: Array<{ payload: Sale[]; options: { onConflict: string } }> = [];
  const updates: Record<string, unknown>[] = [];
  const admin = { from(table: string) {
    expect(table).toBe("ticketline_daily_sales");
    return { async upsert(payload: Sale[], options: { onConflict: string }) {
      upserts.push({ payload, options });
      for (const p of payload) {
        const old = sales.find(s => s.event_id === p.event_id && s.sale_date === p.sale_date);
        if (old) Object.assign(old, p); else sales.push({ ...p });
      }
      return { error: null };
    } };
  } };
  return { admin, sales, upserts, updates };
}
async function execute(targets: CaptureTarget[], rows: CaptureRow[], names: string[], parsed = report(rows)) {
  const db = fakeAdmin(targets);
  const before = structuredClone(db.sales);
  const nameById = new Map(targets.map((t, i) => [t.event_id, names[i]]));
  const result = await applyCaptureDay(db.admin, {
    targets, dayIso: day, nameById, debug: { synthetic: true }, headerRange: "synthetic period", fileSize: 123,
    updateRun: async patch => { db.updates.push(patch); },
  }, parsed);
  return { ...db, result, before, nameById };
}
async function blocked(targets: CaptureTarget[], rows: CaptureRow[], names: string[], phase: string, parsed = report(rows)) {
  const db = await execute(targets, rows, names, parsed);
  expect(db.result.ok).toBe(false);
  expect(db.upserts).toHaveLength(0);
  expect(db.sales).toEqual(db.before);
  expect(db.updates).toHaveLength(1);
  expect(db.updates[0].status).toBe(phase);
  expect(db.updates[0].error_message).toEqual(expect.any(String));
  expect(db.updates[0].import_audit).toMatchObject({ reportRows: rows });
}

describe("#358 whole-report capture with real fake-admin UPSERT boundary", () => {
  it("8 coded + 5 uncoded nonconsumers: 1 real + 7 zeros, five histories preserved", async () => {
    const targets = [...Array.from({ length: 8 }, (_, i) => target(`coded${i}`, `${900001 + i}`)),
      ...Array.from({ length: 5 }, (_, i) => target(`legacy${i}`, null))];
    const db = await execute(targets, [row("Cantor Fictício - Vila Solar [900001]", "900001")], targets.map((_, i) => `Espetáculo Fictício ${i}`));
    expect(db.result.ok).toBe(true);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].options).toEqual({ onConflict: "event_id,sale_date" });
    expect(db.upserts[0].payload).toHaveLength(8);
    expect(db.upserts[0].payload[0]).toEqual({ company_id: "synthetic-company", event_id: "event-coded0", sale_date: day, quantity: 3, total_value: 90 });
    expect(db.upserts[0].payload.slice(1).map(p => [p.quantity, p.total_value])).toEqual(Array.from({ length: 7 }, () => [0, 0]));
    expect(db.sales.slice(8)).toEqual(db.before.slice(8));
    expect(db.result.audit).toMatchObject({ coverage: "coded_and_matched", counts: { matched: 1, zeroed: 7, omitted: 5, external: 0 } });
    expect(db.result.audit).toHaveProperty("skippedConfigs", targets.slice(8).map(t => ({ configId: t.id, event_id: t.event_id, reason: "not_identifiable_no_movement" })));
    expect(db.updates[0].status).toBe("success");
    expect(db.updates[0].error_message).toContain("5 configs");
    expect(db.result).toMatchObject({ coverage: "coded_and_matched", counts: { omitted: 5 }, warning: expect.any(String) });
  });
  it.each([
    { daily_fallback_active: true }, { promotores_migrated_at: "2026-10-24T00:00:00Z" },
  ])("missing uncoded consumer %j aborts whole batch", async flags => {
    await blocked([target("coded", "900001"), target("legacy", null, flags)], [row("Venda forte", "900001")], ["Cantor Fictício - Vila Solar", "Outra Banda - Vila Lunar"], "capture_day_unmatched_consumer");
  });
  it.each(["900001", null])("unknown code with safe full name conflicts with target code %s", async code => {
    await blocked([target("a", code)], [row("Cantor Fictício - Vila Solar | sessão futura", "999999")], ["Cantor Fictício - Vila Solar"], "capture_day_code_conflict");
  });
  it.each([
    "Vila Solar",
    "Cantor Fictício",
    "Espetáculo descritivo de longa duração | local: Vila Solar | sessão 21h",
  ])("unknown code with visible partial identity %s blocks the entire UPSERT", async label => {
    await blocked([target("a", "900001"), target("b", "900002"), target("legacy", null)],
      [row("Venda forte já mapeada", "900002"), row(label, "999999")],
      ["Cantor Fictício - Vila Solar - edição especial", "Outra Banda - Vila Lunar", "Terceira Banda - Vila Nova"],
      "capture_day_suspect_match");
  });
  it("unknown external code sharing edition words or city substring remains audited external", async () => {
    const db = await execute([target("a", "900001")],
      [row("Festival Exterior especial | local: Vila Solaria", "999999")],
      ["Cantor Fictício - Vila Solar - especial 2027"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts).toHaveLength(1);
    expect(db.result.audit).toMatchObject({ counts: { external: 1, zeroed: 1 }, externalRows: [{ reason: "unknown_code_external" }] });
  });
  it("known strong code remains prioritized despite identity after the pipe", async () => {
    const db = await execute([target("a", "900001"), target("b", "900002")],
      [row("Label descritivo | local: Vila Solar | Cantor Fictício", "900002")],
      ["Cantor Fictício - Vila Solar", "Outra Banda - Vila Lunar"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts[0].payload.map(p => [p.event_id, p.quantity])).toEqual([["event-a", 0], ["event-b", 3]]);
  });
  it("legitimate unknown-code external row ignored but included in TOTAL", async () => {
    const db = await execute([target("a", "900001")], [row("Festival Exterior", "999999", 5, 150)], ["Cantor Fictício - Vila Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts[0].payload[0].quantity).toBe(0);
    expect(db.result.audit).toMatchObject({ totals: { qty: 5, value: 150 }, counts: { external: 1, zeroed: 1 }, externalRows: [{ reason: "unknown_code_external" }] });
  });
  it("duplicate configured codes block even with no matching sale", async () => {
    await blocked([target("a", "900001"), target("b", "900 001")], [], ["Cantor A - Solar", "Cantor B - Lunar"], "capture_day_ambiguous_match");
  });
  it("two rows for one known code block before write", async () => {
    await blocked([target("a", "900001")], [row("Primeira", "900001"), row("Segunda", "900001")], ["Cantor Fictício - Vila Solar"], "capture_day_ambiguous_match");
  });
  it("same complete name on two uncoded configs is ambiguous", async () => {
    await blocked([target("a", null), target("b", null)], [row("Cantor Fictício - Vila Solar", null)], ["Cantor Fictício - Vila Solar", "Cantor Fictício - Vila Solar"], "capture_day_ambiguous_match");
  });
  it.each(["Vila Solar", "Cantor Fictício"])("isolated identity %s blocks inferred zeros", async label => {
    await blocked([target("a", "900001"), target("b", null)], [row(label, null)], ["Cantor Fictício - Vila Solar", "Outra Banda - Vila Solar"], "capture_day_suspect_match");
  });
  it("safe long label matches uncoded active consumer", async () => {
    const db = await execute([target("a", null, { daily_fallback_active: true })], [row("Cantor Fictício - Vila Solar edição especial | sessão 21h", null)], ["Cantor Fictício - Vila Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts[0].payload[0].quantity).toBe(3);
  });
  it("city prefix never matches another city", async () => {
    await blocked([target("a", null)], [row("Cantor Fictício - Vila Solaria", null)], ["Cantor Fictício - Vila Solar"], "capture_day_suspect_match");
  });
  it("code priority tolerates long label naming another event", async () => {
    const db = await execute([target("a", "900001"), target("b", null)], [row("Outra Banda - Vila Solar longa descrição | futuro", "900 001")], ["Cantor Fictício - Vila Solar", "Outra Banda - Vila Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts[0].payload).toHaveLength(1);
    expect(db.upserts[0].payload[0].event_id).toBe("event-a");
    expect(db.sales[1]).toEqual(db.before[1]);
  });
  it("code order and separators retained (never normalize to a set)", async () => {
    const targets = [target("a", "900001/900002"), target("b", "900002/900001"), target("c", "900001900002")];
    const db = await execute(targets, [row("Long unknown label", "900002 / 900001")], ["Evento Alfa", "Evento Beta", "Evento Gama"]);
    expect(db.upserts[0].payload.map(p => p.quantity)).toEqual([0, 3, 0]);
    const mapping = resolveCaptureMapping([row("Exterior", "900001-900002")], targets, db.nameById);
    expect(mapping.counts).toMatchObject({ matched: 0, zeroed: 3, external: 1 });
  });
  it("single-token event name cannot authorize uncoded match", async () => {
    await blocked([target("a", null)], [row("Solaria", null)], ["Solaria"], "capture_day_suspect_match");
  });
  it("whole-token suspicion avoids substring false match", async () => {
    const db = await execute([target("a", "900001")], [row("Solariano", null)], ["Fictício - Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.result.audit).toMatchObject({ counts: { external: 1 } });
  });
  it("generic edition words shared by external labels do not block capture", async () => {
    const db = await execute([target("a", "900001")], [row("Festival Exterior especial", null)], ["Cantor Fictício - Vila Solar - especial 2027"]);
    expect(db.result.ok).toBe(true);
    expect(db.result.audit).toMatchObject({ counts: { external: 1, zeroed: 1 } });
  });
  it("short artist identity without code blocks zeros but never assigns another artist in same city", async () => {
    await blocked([target("a", "900001"), target("b", null)], [row("ZX", null)], ["ZX - Vila Solar", "Outra Banda - Vila Solar"], "capture_day_suspect_match");
  });
  it("valid no-movement TOTAL writes legitimate coded zeros", async () => {
    const db = await execute([target("a", "900001")], [], ["Cantor Fictício - Vila Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.upserts[0].payload[0]).toMatchObject({ quantity: 0, total_value: 0 });
    expect(db.updates[0].error_message).toBeNull();
  });
  it("explicit zero row is matched, not inferred", async () => {
    const db = await execute([target("a", null)], [row("Cantor Fictício - Vila Solar", null, 0, 0)], ["Cantor Fictício - Vila Solar"]);
    expect(db.result.ok).toBe(true);
    expect(db.result.audit).toMatchObject({ counts: { matched: 1, zeroed: 0 } });
  });
  it.each([null, { qty: null, value: 0 }, { qty: 1, value: 0 }])("invalid TOTAL %j yields zero UPSERT", async totalRow => {
    await blocked([target("a", "900001")], [], ["Evento Fictício"], "capture_day_total_mismatch", { rows: [], totalRow });
  });
  it("external rows must reconcile too", async () => {
    const rows = [row("Festival Exterior", "999999")];
    await blocked([target("a", "900001")], rows, ["Evento Fictício"], "capture_day_total_mismatch", { rows, totalRow: { qty: 0, value: 0 } });
  });
  it.each([5001, NaN, 1.5])("invalid qty %s yields zero UPSERT", async qty => {
    await blocked([target("a", "900001")], [row("Forte", "900001", qty)], ["Evento Fictício"], "capture_day_sanity");
  });
});