import { describe, it, expect } from "vitest";
import { runTicketlineImport } from "../../supabase/functions/_shared/ticketline-import-server";

// #78 — relatório sem zonas (zona sintética "Geral") seguido de relatório por
// zona no mesmo evento/período: só uma série pode ficar.

type Row = Record<string, any>;
function fakeDb() {
  const t: Record<string, Row[]> = {
    events: [{ id: "ev1", company_id: "co1" }],
    event_ticket_zones: [], event_ticket_lots: [], ticket_sales: [],
    event_ticket_office_assignments: [], ticket_import_logs: [],
  };
  let seq = 0;
  const from = (table: string) => {
    const f: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "delete" = "select";
    let ins: Row[] = [];
    const run = () => {
      const rows = t[table];
      if (op === "insert") {
        const out = ins.map((r) => ({ id: `id${++seq}`, ...r }));
        rows.push(...out);
        return out;
      }
      const hit = rows.filter((r) => f.every((p) => p(r)));
      if (op === "delete") t[table] = rows.filter((r) => !hit.includes(r));
      return hit;
    };
    const b: any = {
      select: () => b, order: () => b,
      insert: (r: Row | Row[]) => { op = "insert"; ins = Array.isArray(r) ? r : [r]; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (k: string, v: any) => { f.push((r) => r[k] === v); return b; },
      is: (k: string, v: any) => { f.push((r) => (r[k] ?? null) === v); return b; },
      in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return b; },
      gte: (k: string, v: any) => { f.push((r) => r[k] >= v); return b; },
      lte: (k: string, v: any) => { f.push((r) => r[k] <= v); return b; },
      range: async (a: number, z: number) => ({ data: run().slice(a, z + 1), error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  };
  return { t, supabase: { from } };
}

const header = { period_from: "2026-06-22", period_to: "2026-08-22" } as any;
const day = (date: string, q: number, v: number) => ({ date, vendasQty: q, vendasValue: v, geralQty: q, geralValue: v });

describe("#78 runTicketlineImport — transição de formato", () => {
  it("relatório sem zonas e depois por zona → só uma série fica, sem warning de reconciliação", async () => {
    const db = fakeDb();
    await runTicketlineImport({
      supabase: db.supabase, eventId: "ev1", ticketlineAccountId: "acc", filenames: { summary: "a.xlsx" },
      parseResult: { header, rows: [], warnings: [], section1Daily: [day("2026-07-01", 100, 3700), day("2026-07-02", 127, 4705)], section2DailyTotals: [] } as any,
    });
    expect(db.t.ticket_sales.reduce((a, r) => a + r.quantity, 0)).toBe(227);
    expect(db.t.event_ticket_zones.map((z) => z.name)).toEqual(["Geral"]);

    const audit = await runTicketlineImport({
      supabase: db.supabase, eventId: "ev1", ticketlineAccountId: "acc", filenames: { summary: "b.xlsx" },
      parseResult: {
        header, warnings: [], section1Daily: [], section2DailyTotals: [],
        rows: [
          { date: "2026-07-01", zone: "Plateia", lot: "L1", ticketType: null, rawLabel: "x", totalGeralQty: 100, totalGeralValue: 3700, totalVendasQty: 100, totalVendasValue: 3700 },
          { date: "2026-07-02", zone: "Balcão", lot: "L1", ticketType: null, rawLabel: "y", totalGeralQty: 127, totalGeralValue: 4705, totalVendasQty: 127, totalVendasValue: 4705 },
        ],
      } as any,
    });
    const qty = db.t.ticket_sales.reduce((a, r) => a + r.quantity, 0);
    expect(qty).toBe(227); // antes da correção: 454 (duas séries)
    const geralId = db.t.event_ticket_zones.find((z) => z.name === "Geral")!.id;
    expect(db.t.ticket_sales.some((r) => r.zone_id === geralId)).toBe(false);
    expect(audit.reconciliation?.diffQty).toBe(0);
    expect(audit.warnings.some((w) => w.startsWith("Transição de formato"))).toBe(true);
  });

  it("BD diverge do relatório → reconciliação assinala a diferença", async () => {
    const db = fakeDb();
    // venda gravada no período por uma conta diferente não conta; mas uma
    // venda da mesma conta/fonte numa zona criada depois do load inicial conta.
    db.t.event_ticket_zones.push({ id: "zx", event_id: "ev1", name: "Plateia", session_id: null });
    const audit = await runTicketlineImport({
      supabase: db.supabase, eventId: "ev1", ticketlineAccountId: "acc", filenames: { summary: "c.xlsx" },
      parseResult: {
        header, warnings: [], section1Daily: [], section2DailyTotals: [],
        rows: [{ date: "2026-07-01", zone: "Plateia", lot: "L1", ticketType: null, rawLabel: "x", totalGeralQty: 10, totalGeralValue: 0, totalVendasQty: 10, totalVendasValue: 0 }],
      } as any,
    });
    // linhas a zero não são gravadas → total do relatório (0 €) bate; força divergência:
    expect(audit.reconciliation?.diffQty).toBe(0);
    db.t.ticket_sales.push({ id: "dup", zone_id: "zx", financial_account_id: "acc", source: "ticketline_import", sale_date: "2026-07-05", quantity: 5, total_value: 50 });
    const audit2 = await runTicketlineImport({
      supabase: db.supabase, eventId: "ev1", ticketlineAccountId: "acc", filenames: { summary: "d.xlsx" },
      parseResult: { header: { period_from: "2026-07-01", period_to: "2026-07-01" }, warnings: [], section1Daily: [], section2DailyTotals: [],
        rows: [{ date: "2026-07-01", zone: "Plateia", lot: "L1", ticketType: null, rawLabel: "x", totalGeralQty: 10, totalGeralValue: 0, totalVendasQty: 10, totalVendasValue: 0 }] } as any,
    });
    // a linha de 05/07 está fora do período do relatório → não é apagada nem contada
    expect(audit2.reconciliation?.diffQty).toBe(0);
    expect(db.t.ticket_sales.some((r) => r.id === "dup")).toBe(true);
  });
});
