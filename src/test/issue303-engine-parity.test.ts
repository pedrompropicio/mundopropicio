import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { buildPartnerStatementDoc, buildStatementTicketOfficeProvenance, type PartnerStatementDocInput, type StatementTicketOfficeProvenance } from "@/lib/partner-statement-doc";
import { buildStatementPdf, buildStatementWorkbook } from "@/lib/export-partner-statement-doc";
import { buildPartnerStatement, computeStatementEngine, type StatementBundle } from "@shared/settlement/statement-service.ts";
import { loadPartnerTicketOfficeProvenance, PartnerTicketOfficeProvenance } from "@/components/ReportPartnerSettlement";
import { issue303ConsumerFixture } from "./fixtures/issue303-statement";

const scope = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => scope.db.from(table) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-synthetic" } }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company-synthetic" }) }));

const input: PartnerStatementDocInput = {
  eventName: "Evento sintético #303", eventDate: "2026-10-01", eventLocation: "Cidade",
  recipientName: "Sócio sintético",
  participants: [{ name: "Sócio sintético", percentage: 40 }, { name: "MUNDO PROPÍCIO", percentage: 60, isHouse: true }],
  revenues: [{ origin: "Bilheteira", description: "Sessão A", net: 1000.01 }, { origin: "Bilheteira", description: "Sessão B", net: 23.45 }],
  expenseLines: [{ categoryId: "cost", description: "Som", base: 100.17, ivaRate: 23 }],
  categories: [{ id: "cost", code: "2.1", name: "Produção", parent_id: null }],
  usesGrossExpenses: true, paidByPartner: 12.34, partnerExtras: 2.01,
  paidByPartnerLines: [{ date: "2026-10-01", description: "Despesa paga", category: "Produção", amount: 12.34 }],
  partnerExtrasLines: [{ date: "2026-10-02", description: "Extra", origin: "Manual", amount: 2.01 }],
  transferWithVat: true,
};
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const sheetCells = (wb: Awaited<ReturnType<typeof buildStatementWorkbook>>) => wb.worksheets.map(ws => ({
  name: ws.name, rows: ws.getSheetValues(),
}));
const metadata: StatementTicketOfficeProvenance[] = [{ eventId: "event-a", eventName: input.eventName,
  financialAccountId: "account-a", officeName: "Bilheteira sintética", statementId: "first", statementNumber: "SYN/2030",
  quotaLineId: "quota-a", eventRight: 700, documentPage: 1, documentLineRef: "quota-a" }];

function fixture() {
  const f = issue303ConsumerFixture();
  const calls: { table: string; page: number[] | null }[] = [];
  const db = { from(table: string) {
    const filters: ((row: any) => boolean)[] = [], orders: string[] = [];
    let page: number[] | null = null, single = false;
    const q = {
      select: (_columns: string) => q,
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return q; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return q; },
      order(key: string) { orders.push(key); return q; },
      range(a: number, b: number) { page = [a, b]; return q; },
      maybeSingle() { single = true; return q; },
      then(resolve: any, reject: any) {
        calls.push({ table, page });
        let rows = f.tables[table].filter(row => filters.every(filter => filter(row)));
        rows = [...rows].sort((a, b) => {
          for (const key of orders) { const c = String(a[key]).localeCompare(String(b[key])); if (c) return c; }
          return 0;
        });
        if (page) rows = rows.slice(page[0], page[1] + 1);
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
  scope.db = db;
  return { ...f, calls };
}

function bundle(child: boolean, withVat: boolean, realized: boolean): StatementBundle {
  const cost = { id: "cost", event_id: "event-a", type: "expense", status: "approved", amount: 100.17, iva_rate: 23 };
  const participant = (house: boolean, settlement: string) => ({ id: `${settlement}-${house}`, participantId: `${settlement}-${house}`,
    settlement_id: settlement, supplier_id: house ? null : "supplier", name: house ? "MUNDO PROPÍCIO" : "Sócio sintético",
    isHouse: house, mode: "settles", percentage: house ? 60 : 40, loss_percentage: 40, transfer_with_vat: true });
  return {
    eventId: "event-a", eventName: input.eventName, eventDate: input.eventDate, eventLocation: input.eventLocation,
    basis: { withVat, includeOverhead: true, expenseSource: realized ? "realized" : "committed" },
    calcBasis: withVat ? "net_result_gross_expenses" : "net_result", events: [{ id: "event-a" }],
    transactions: [cost], forecasts: [cost], categories: [],
    settlements: [{ id: "root", parent_id: null }, ...(child ? [{ id: "child", parent_id: "root", parent_share_pct: 50, parent_share_basis: "net_result" }] : [])],
    participants: [participant(true, "root"), participant(false, child ? "child" : "root"), ...(child ? [participant(true, "child")] : [])],
    paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [],
    ticketSales: [{ gross: 1060.01, net: 1000.01 }], ticketBreakdown: [{ label: "Sessão", net: 1000.01 }],
    operations: [], participations: [], localeBySupplier: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("#303 E2b — referência main b2b5baa, capturada antes de editar produção", () => {
  it("conserva os hashes do documento, folhas/células, XLSX e PDF sem metadados", async () => {
    const doc = buildPartnerStatementDoc(input);
    const wb = await buildStatementWorkbook(doc);
    const pdf = buildStatementPdf(doc);
    pdf.setFileId("30303030303030303030303030303030");
    const hashes = {
      document: sha(JSON.stringify(doc)),
      sheets: sha(JSON.stringify(sheetCells(wb))),
      xlsx: sha(new Uint8Array(await wb.xlsx.writeBuffer())),
      pdf: sha(new Uint8Array(pdf.output("arraybuffer"))),
    };
    expect(hashes).toEqual({
      document: "28b68fb7ce96be2b3f880118639c1dab682665e33f02fe6b4607411996693055",
      sheets: "66899b3c1808fc75541bd8c71cf474520ed36dc5be86d1a75b4d6404539d1ed1",
      xlsx: "178bcb0e7a45bc458aec0c60dda28f3ebeba2db501fb3c110916faf2c4616dd8",
      pdf: "699c058e1b79508f16a89cf74ef4b955daabf9a8da4e41a0a3ac27439498df25",
    });
  });
});

describe("#303 E2b — apresentação aditiva", () => {
  it.each(["pt-PT", "pt-BR"] as const)("PDF e Excel contêm as duas origens em %s; preservam todas as células anteriores", async locale => {
    const legacy = buildPartnerStatementDoc({ ...input, locale });
    const doc = buildPartnerStatementDoc({ ...input, locale, ticketOfficeProvenance: metadata });
    const { ticketOfficeProvenance: block, ...rest } = doc;
    expect(rest).toStrictEqual(legacy);
    expect(block).toStrictEqual(buildStatementTicketOfficeProvenance(metadata));
    const before = await buildStatementWorkbook(legacy), after = await buildStatementWorkbook(doc);
    before.worksheets.forEach(ws => {
      const added = after.getWorksheet(ws.name)!;
      ws.eachRow(row => row.eachCell(cell => {
        expect(added.getCell(cell.address).value).toStrictEqual(cell.value);
        expect(added.getCell(cell.address).style).toStrictEqual(cell.style);
      }));
    });
    const cells = JSON.stringify(sheetCells(after));
    const pdf = buildStatementPdf(doc);
    const text = (pdf as any).internal.pages.join("\n").replace(/\\([()])/g, "$1");
    for (const label of ["Proveniência da bilheteira", "Direito (apuramento)", "Recebimento (repasse)", "SYN/2030"]) {
      expect(cells).toContain(label); expect(text).toContain(label);
    }
    expect(block!.rows[0].value).toBe(700);
    expect(block!.rows[1].value).toBeNull();
    expect(block!.rows[1].reference).toContain("O direito não comprova recebimento");
    // Detail page streams are identical: original lines C/D and amounts survive.
    const originalPdf = buildStatementPdf(legacy);
    expect((pdf as any).internal.pages.slice(-1)).toStrictEqual((originalPdf as any).internal.pages.slice(-1));
  });

  it("omissão, undefined e lista vazia conservam o objecto e os bytes dos exportadores", async () => {
    const legacy = buildPartnerStatementDoc(input);
    for (const value of [undefined, []]) {
      const doc = buildPartnerStatementDoc({ ...input, ticketOfficeProvenance: value });
      expect(doc).toStrictEqual(legacy); expect(doc).not.toHaveProperty("ticketOfficeProvenance");
      const pdf = buildStatementPdf(doc), before = buildStatementPdf(legacy);
      pdf.setFileId("30303030303030303030303030303030"); before.setFileId(pdf.getFileId());
      expect(pdf.output()).toBe(before.output());
      expect(await (await buildStatementWorkbook(doc)).xlsx.writeBuffer()).toEqual(await (await buildStatementWorkbook(legacy)).xlsx.writeBuffer());
    }
  });

  it("renderiza o mesmo bloco sem editores; ausência omite-o e erro fica explícito", () => {
    const view = render(createElement(PartnerTicketOfficeProvenance, { entries: metadata }));
    expect(screen.getByRole("region", { name: "Proveniência da bilheteira" })).toBeInTheDocument();
    expect(screen.getByText("Direito (apuramento)")).toBeInTheDocument();
    expect(screen.getByText("Recebimento (repasse)")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/bilheteiras?conta=account-a&separador=apuramentos#apuramento-first");
    expect(view.container.querySelector("input,button,select")).toBeNull();
    view.rerender(createElement(PartnerTicketOfficeProvenance, { entries: [] }));
    expect(view.container.innerHTML).toBe("");
    view.rerender(createElement(PartnerTicketOfficeProvenance, { error: new Error("fixture") }));
    expect(screen.getByRole("status")).toHaveTextContent("indisponível");
  });

  it("recusa direitos não finitos, sem precisão documental ou duplicados", () => {
    for (const eventRight of [NaN, Infinity, 1.001]) expect(() => buildStatementTicketOfficeProvenance([{ ...metadata[0], eventRight }])).toThrow();
    expect(() => buildStatementTicketOfficeProvenance([...metadata, ...metadata])).toThrow();
  });
});

describe("#303 E2b — metadados só de leitura R5/R8", () => {
  it("usa a pertença original e o recibo congelado; não transforma Q4, carry_over ou advance em quota", async () => {
    const f = fixture();
    // A mutable mirror cannot change the right preserved in the receipt.
    f.tables.ticket_office_statement_lines.find(l => l.id === "quota-a")!.declared_event_net = 999;
    const snapshot = JSON.stringify(f.tables);
    const rows = await loadPartnerTicketOfficeProvenance(f.company, ["event-a"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventId: "event-a", statementId: "first", quotaLineId: "quota-a", eventRight: 700 });
    expect(JSON.stringify(rows)).not.toMatch(/repasse-first|carry-next|q4-a/);
    expect(JSON.stringify(f.tables)).toBe(snapshot);
    expect(f.calls.filter(c => c.table !== "company_features").every(c => c.page !== null)).toBe(true);
  });

  it("conta desligada, empresa diferente e evento sem pertença não inventam proveniência", async () => {
    const f = fixture(); f.tables.company_features[0].enabled = false;
    expect(await loadPartnerTicketOfficeProvenance(f.company, ["event-a"])).toEqual([]);
    expect(await loadPartnerTicketOfficeProvenance("other-company", ["event-a"])).toEqual([]);
    expect(await loadPartnerTicketOfficeProvenance(f.company, ["no-event"])).toEqual([]);
  });

  it("o estado da pertença documental prevalece sobre o estado do fecho legado", async () => {
    const f = fixture(); f.tables.ticket_office_settlements[0].status = "draft";
    expect(await loadPartnerTicketOfficeProvenance(f.company, ["event-a"])).toMatchObject([{ eventRight: 700, statementId: "first" }]);
    // A legacy confirmed row on its own never proves the new documentary right.
    f.tables.ticket_office_settlements.push({ ...f.tables.ticket_office_settlements[0], event_id: "event-without-membership", status: "confirmed" });
    expect(await loadPartnerTicketOfficeProvenance(f.company, ["event-without-membership"])).toEqual([]);
  });

  it("recibo e quota inválidos falham explicitamente", async () => {
    const f = fixture();
    f.tables.ticket_office_statements.find(s => s.id === "first")!.confirmation_receipt.revision = 99;
    await expect(loadPartnerTicketOfficeProvenance(f.company, ["event-a"])).rejects.toThrow();
  });
});

describe("#303 E2b — motor, C1/C2, residual, participações e totais", () => {
  it.each([[false, false, false], [false, true, true], [true, false, false], [true, true, true]])(
    "preserva saída completa, raiz/filho=%s IVA=%s realizado=%s", (child, vat, realized) => {
      const before = bundle(child, vat, realized), withMetadata = { ...structuredClone(before), ticketOfficeProvenance: structuredClone(metadata) };
      expect(computeStatementEngine(withMetadata)).toStrictEqual(computeStatementEngine(before));
      const oldStatement = buildPartnerStatement(before, "supplier")!;
      const next = buildPartnerStatement(withMetadata, "supplier")!;
      expect(next).not.toBeNull();
      const { ticketOfficeProvenance: transported, ...doc } = next.doc;
      expect(transported).toEqual(metadata);
      expect({ ...next, doc }).toStrictEqual(oldStatement);
      // The legacy engine annotates settlement.__depth. Metadata must preserve
      // that existing behaviour too, rather than changing the engine here.
      const { ticketOfficeProvenance: _metadata, ...afterBundle } = withMetadata;
      expect(afterBundle).toStrictEqual(before);
      expect(_metadata).toEqual(metadata);
    },
  );

  it("mantém intactos os bytes do núcleo e da receita/ticketProjection da base", () => {
    expect(sha(readFileSync("supabase/functions/_shared/settlement/event-settlement-engine.ts"))).toBe("97557c5b94d99c2005156958ce849574f8eca24233b8af3a1203185228f014e6");
    expect(sha(readFileSync("supabase/functions/_shared/settlement/settlement-revenue.ts"))).toBe("572bdadfdeba0d10139f798905ee399cf590289533b51206a4483a56cdfbc1cb");
  });
});
