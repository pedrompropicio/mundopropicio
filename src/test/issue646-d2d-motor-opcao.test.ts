import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeSettlementRevenue,
  type SettlementRevenueInput,
  type TicketProjection,
} from "@shared/settlement/settlement-revenue.ts";
import { computeEventSettlementTotals } from "@shared/settlement/event-settlement-inputs.ts";
import {
  buildPartnerStatement,
  computeStatementEngine,
  type StatementBundle,
} from "@shared/settlement/statement-service.ts";
import { expandMasterRevenueToSplits } from "@shared/settlement/master-revenue-proration.ts";
import { isValidFechoTransaction } from "@shared/settlement/fecho-filters.ts";
import { roundCents } from "@shared/settlement/iva.ts";

const EVENT = "event-synthetic";
const ROOT = "settlement-root";
const CHILD = "settlement-child";
const SUPPLIER = "supplier-synthetic";

const tx = (code: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id: `tx-${code}`, event_id: EVENT, description: `Real ${code}`, type: "income",
  status: "paid", amount, iva_rate: 0, account_categories: { code, name: `Origem ${code}` }, ...extra,
});
const bp = (code: string, amount: number, extra: Record<string, unknown> = {}) => ({
  ...tx(code, amount), id: `bp-${code}`, description: `BP ${code}`, status: "approved", ...extra,
});
const allBp = () => [bp("1.1.01", 900), bp("1.1.03", 50), bp("1.2.01", 75), bp("1.3.01", 25)];
const participant = (isHouse: boolean, settlement = ROOT, percentage = isHouse ? 60 : 40) => ({
  id: `${settlement}-${isHouse ? "house" : "partner"}`,
  participantId: `${settlement}-${isHouse ? "house" : "partner"}`,
  settlement_id: settlement, supplier_id: isHouse ? null : SUPPLIER,
  name: isHouse ? "MUNDO PROPÍCIO" : "Sócio sintético", isHouse, mode: "settles",
  percentage, loss_percentage: null, transfer_with_vat: false,
});

function bundle(extra: Partial<StatementBundle> = {}): StatementBundle {
  const cost = {
    id: "cost", event_id: EVENT, type: "expense", description: "Custo sintético",
    status: "approved", amount: 100.17, iva_rate: 23,
  };
  return {
    eventId: EVENT, eventName: "Evento sintético", eventDate: null, eventLocation: null,
    basis: { withVat: false, includeOverhead: true, expenseSource: "committed" }, calcBasis: "net_result",
    events: [{ id: EVENT, parent_event_id: null }], transactions: [cost], forecasts: [cost],
    categories: [], settlements: [{ id: ROOT, name: "Raiz", parent_id: null }],
    participants: [participant(true), participant(false)], paidExpenses: [], extras: [],
    revenuesHeldRaw: [], grossDisbursementSupplierIds: [], ticketSales: [], ticketBreakdown: [],
    operations: [], participations: [], localeBySupplier: {}, ...extra,
  };
}

function childBundle(extra: Partial<StatementBundle> = {}): StatementBundle {
  return bundle({
    settlements: [
      { id: ROOT, name: "Raiz", parent_id: null },
      { id: CHILD, name: "Filho", parent_id: ROOT, parent_share_pct: 50, parent_share_basis: "net_result" },
    ],
    participants: [participant(true, ROOT, 50), participant(true, CHILD), participant(false, CHILD)],
    ...extra,
  });
}

function masterBundle(real: boolean): StatementBundle {
  const events = [{ id: "master" }, { id: EVENT, parent_event_id: "master" }, { id: "other", parent_event_id: "master" }];
  const forecasts = [bp("1.3.04", 300, {
    event_id: "master", revenue_split_mode: "equal", excluded_from_partner_settlement: true,
  }), bp("1.2.01", 200, { event_id: "master", revenue_split_mode: "equal" })];
  const transactions = real ? [tx("1.2.01", 160, { event_id: "master", forecast_id: "bp-1.2.01" })] : [];
  const slices = expandMasterRevenueToSplits({ events, forecasts, transactions });
  return bundle({
    events: [events[1]], transactions: slices.transactionSlices.filter(t => t.event_id === EVENT),
    forecasts: slices.forecastSlices.filter(f => f.event_id === EVENT),
  });
}

const sales = [{ gross: 212.02, net: 200.02 }];
const matrix: Array<[string, StatementBundle]> = [
  ["sem receita", bundle()],
  ["ticketSales sem TX", bundle({ ticketSales: sales })],
  ["só 1.1.01", bundle({ transactions: [tx("1.1.01", 150.01)] })],
  ["descendente 1.1.01 e BP", bundle({ transactions: [tx("1.1.01.02", 150.01)], forecasts: allBp() })],
  ["ticketSales, TX duplicada e detalhe", bundle({ ticketSales: sales, ticketBreakdown: [{ label: "Lote real", net: 200.02 }], transactions: [tx("1.1.01", 999)] })],
  ["BP só na bilheteira", bundle({ forecasts: [bp("1.1.01", 900, { iva_rate: 6 })] })],
  ["BP em todos os buckets", bundle({ forecasts: allBp() })],
  ["real nos quatro buckets substitui BP", bundle({ ticketSales: sales, transactions: [tx("1.1.01", 999), tx("1.1.03", 40), tx("1.2.01", 60), tx("1.3.01", 20)], forecasts: allBp() })],
  ["receita real só da casa bloqueia BP", bundle({ ticketSales: sales, transactions: [tx("1.3.01", 70.11, { excluded_from_partner_settlement: true })], forecasts: allBp() })],
  ["receita BP só da casa", bundle({ forecasts: [...allBp(), bp("1.3.04", 70.11, { excluded_from_partner_settlement: true })] })],
  ["Master com fatias reais e só da casa", masterBundle(true)],
  ["Master com fatias BP e só da casa", masterBundle(false)],
  ["filho com receitas e despesas exclusivas", childBundle({ transactions: [tx("1.3.01", 200), tx("1.2.01", 30, { event_settlement_id: CHILD })], forecasts: [bp("1.1.01", 900), { id: "child-cost", type: "expense", status: "approved", amount: 10, iva_rate: 23, event_settlement_id: CHILD }] })],
  ["filho com bilheteira TX exclusiva", childBundle({ transactions: [tx("1.1.01", 150.01, { event_settlement_id: CHILD }), tx("1.3.01", 40)], forecasts: allBp() })],
  ["filho com BP bilheteira exclusivo", childBundle({ forecasts: [bp("1.1.01", 900, { event_settlement_id: CHILD }), bp("1.3.01", 40)] })],
  ["base realizada c/IVA e receita só da casa", bundle({ calcBasis: "net_result_gross_expenses", basis: { withVat: true, expenseSource: "realized", includeOverhead: false }, ticketSales: sales, forecasts: allBp(), transactions: [...bundle().transactions, tx("1.3.04", 70.11, { iva_rate: 23, excluded_from_partner_settlement: true })] })],
];

function revenueInput(b: StatementBundle): SettlementRevenueInput {
  return {
    ticketSales: b.ticketSales, ticketBreakdown: b.ticketBreakdown,
    incomeTransactions: b.transactions.filter(isValidFechoTransaction), incomeForecasts: b.forecasts,
    ...(b.ticketProjection !== undefined ? { ticketProjection: b.ticketProjection } : {}),
  };
}

function projection(): TicketProjection {
  return {
    version: "ticket-projection-v1", gross: 353.03, net: 300.03,
    lines: [
      { unit_id: "date:1/session:1", event_id: EVENT, description: "Data 1 · sessão 1", gross: 106.01, net: 100.01 },
      { unit_id: "date:2/session:1", event_id: null, description: "Data 2 · sessão 1", gross: 247.02, net: 200.02 },
    ],
  };
}

describe("#646 D2-d C1 — paridade sem opção nos três níveis", () => {
  it.each(matrix)("%s", (_name, b) => {
    const input = revenueInput(b);
    const revenue = computeSettlementRevenue(input);
    expect(computeSettlementRevenue({ ...input, ticketProjection: undefined })).toStrictEqual(revenue);
    expect(revenue).not.toHaveProperty("projected");
    expect(computeEventSettlementTotals({ ...b, ticketProjection: undefined })).toStrictEqual(computeEventSettlementTotals(b));
    expect(computeStatementEngine({ ...b, ticketProjection: undefined })).toStrictEqual(computeStatementEngine(b));
    const statement = buildPartnerStatement(b, SUPPLIER);
    expect(statement).not.toBeNull();
    expect(buildPartnerStatement({ ...b, ticketProjection: undefined }, SUPPLIER)).toStrictEqual(statement);
  });
});

describe("#646 D2-d C2 — só a bilheteira é substituída", () => {
  it.each(matrix)("%s", (_name, b) => {
    const before = computeSettlementRevenue(revenueInput(b));
    const p = projection();
    const projectedBundle = { ...b, ticketProjection: p };
    const snapshot = structuredClone(projectedBundle);
    const after = computeSettlementRevenue(revenueInput(projectedBundle));
    expect(after.projected).toBe(true);
    expect(after.buckets.bilheteira).toStrictEqual({ net: p.net, gross: p.gross, source: "real" });
    expect(after.hasTicketSales).toBe(before.hasTicketSales);
    for (const key of ["ab", "patrocinio", "outros"] as const) {
      expect(after.buckets[key]).toStrictEqual(before.buckets[key]);
    }
    expect(after.houseOnlyLines).toStrictEqual(before.houseOnlyLines);
    expect(after.houseOnlyRevenueNet).toBe(before.houseOnlyRevenueNet);
    expect(after.lines.filter(l => l.bucket !== "bilheteira")).toStrictEqual(before.lines.filter(l => l.bucket !== "bilheteira"));
    expect(after.bpLinesUsed).toStrictEqual(before.bpLinesUsed.filter(f => !f.account_categories?.code.startsWith("1.1.01")));
    expect(after.bpBucketsUsed).toStrictEqual(before.bpBucketsUsed.filter(k => k !== "bilheteira"));
    expect(after.excludedTicketingTx.map(t => t.id)).toStrictEqual(
      b.transactions.filter(t => t.type === "income" && t.account_categories?.code.startsWith("1.1.01")).map(t => t.id),
    );
    expect(roundCents(after.revenueNet)).toBe(roundCents(before.revenueNet - before.buckets.bilheteira.net + p.net));
    expect(roundCents(after.eventRevenueGross)).toBe(roundCents(before.eventRevenueGross - before.buckets.bilheteira.gross + p.gross));
    expect(after.lines.filter(l => l.kind === "ticket")).toStrictEqual(p.lines.map(l => ({
      id: l.unit_id, event_id: l.event_id, kind: "ticket", bucket: "bilheteira", origin: "",
      description: l.description, net: l.net, gross: l.gross,
    })));
    const totals = computeEventSettlementTotals(projectedBundle);
    expect(totals.revenueNet).toBe(after.eventRevenueNet);
    expect(totals.revenueGross).toBe(after.eventRevenueGross);
    expect(totals.settlementRevenueNet).toBe(after.revenueNet);
    expect(totals.expensesNet).toBe(computeEventSettlementTotals(b).expensesNet);
    expect(totals.expensesGross).toBe(computeEventSettlementTotals(b).expensesGross);
    const engine = computeStatementEngine(projectedBundle);
    expect(engine.errors).toEqual([]);
    expect(Math.abs(engine.c1.value)).toBe(0);
    expect(Math.abs(engine.c2.value)).toBe(0);
    const statement = buildPartnerStatement(projectedBundle, SUPPLIER)!;
    expect(statement).not.toBeNull();
    expect(statement.doc.revenues.filter(l => p.lines.some(pl => pl.description === l.description)))
      .toStrictEqual(p.lines.map(l => ({ origin: "Bilheteira", description: l.description, net: l.net })));
    expect(projectedBundle).toStrictEqual(snapshot);
    expect(projectedBundle.ticketSales).toBe(b.ticketSales);
  });
});

describe("#646 D2-d C3 — zero explícito não permite reposição pelo BP", () => {
  it.each([false, true])("ticketSales reais presentes: %s", realSales => {
    const b = bundle({ ticketSales: realSales ? sales : [], forecasts: [...bundle().forecasts, ...allBp()], transactions: [tx("1.1.01", 999)] });
    const projected = { ...b, ticketProjection: { version: "ticket-projection-v1" as const, gross: 0, net: 0, lines: [] } };
    const result = computeSettlementRevenue(revenueInput(projected));
    expect(result.buckets.bilheteira).toStrictEqual({ net: 0, gross: 0, source: "real" });
    expect(result.bpBucketsUsed).toEqual(["ab", "patrocinio", "outros"]);
    expect(result.revenueNet).toBe(150);
    expect(result.hasTicketSales).toBe(realSales);
    expect(result.excludedTicketingTx).toStrictEqual(b.transactions);
    expect(computeEventSettlementTotals(projected).revenueNet).toBe(150);
    expect(buildPartnerStatement(projected, SUPPLIER)!.block.account.share).toBe(19.93);
  });

  it("retém uma unidade explicitamente avaliada em zero no detalhe", () => {
    const p = projection();
    p.net = p.gross = 0;
    p.lines = [{ ...p.lines[0], net: 0, gross: 0 }];
    const result = computeSettlementRevenue({ incomeForecasts: allBp(), ticketProjection: p });
    expect(result.lines.find(l => l.id === p.lines[0].unit_id)).toMatchObject({ net: 0, gross: 0, kind: "ticket" });
    expect(result.bpBucketsUsed).not.toContain("bilheteira");
  });
});

const invalidContracts: Array<[string, unknown]> = [
  ["soma líquida divergente", { ...projection(), net: 300.04 }],
  ["soma bruta divergente", { ...projection(), gross: 353.04 }],
  ["unit_id repetido", { ...projection(), lines: projection().lines.map(l => ({ ...l, unit_id: "duplicated" })) }],
  ["versão errada", { ...projection(), version: "ticket-projection-v2" }],
  ["null presente", null],
  ["linhas ausentes", { ...projection(), lines: undefined }],
  ["linhas não são array", { ...projection(), lines: {} }],
  ["sem linhas para total positivo", { ...projection(), lines: [] }],
  ["linha nula", { ...projection(), lines: [null] }],
  ["unit_id vazio", { ...projection(), lines: [{ ...projection().lines[0], unit_id: "" }] }],
  ["unit_id numérico", { ...projection(), lines: [{ ...projection().lines[0], unit_id: 1 }] }],
  ["event_id ausente", { ...projection(), lines: [{ ...projection().lines[0], event_id: undefined }] }],
  ["descrição ausente", { ...projection(), lines: [{ ...projection().lines[0], description: undefined }] }],
  ["soma não finita de linhas finitas", {
    ...projection(), gross: Number.MAX_VALUE,
    lines: projection().lines.map(l => ({ ...l, gross: Number.MAX_VALUE })),
  }],
  ["soma finita divergente com cêntimos fora da escala numérica", {
    ...projection(), gross: 1e307,
    lines: projection().lines.map((l, i) => ({ ...l, gross: i ? 0 : 1e308 })),
  }],
  ["arredondamento de números grandes não pode ocultar uma diferença inteira", {
    ...projection(), gross: 1e15,
    lines: projection().lines.map((l, i) => ({ ...l, gross: i ? 0 : 1e15 + 1 })),
  }],
];
for (const key of ["gross", "net"] as const) {
  invalidContracts.push([`${key} negativo com soma reconciliada`, {
    ...projection(), [key]: -0.01,
    lines: projection().lines.map((l, i) => ({ ...l, [key]: i ? 0 : -0.01 })),
  }]);
  invalidContracts.push([`${key} de linha negativo compensado por outra linha`, {
    ...projection(),
    lines: projection().lines.map((l, i) => ({ ...l, [key]: i ? projection()[key] + 0.01 : -0.01 })),
  }]);
  for (const bad of [-0.01, NaN, Infinity, -Infinity, "0", undefined]) {
    invalidContracts.push([`${key} total inválido: ${String(bad)}`, { ...projection(), [key]: bad }]);
    invalidContracts.push([`${key} de linha inválido: ${String(bad)}`, {
      ...projection(), lines: [{ ...projection().lines[0], [key]: bad }, projection().lines[1]],
    }]);
  }
}

describe("#646 D2-d C4 — contrato inválido falha explicitamente nos três níveis", () => {
  it.each(invalidContracts)("%s", (_name, invalid) => {
    const b = bundle({ ticketSales: sales, forecasts: allBp(), transactions: [tx("1.1.01", 999)] });
    const ticketProjection = invalid as TicketProjection;
    const projected = { ...b, ticketProjection };
    expect(() => computeSettlementRevenue({ ...revenueInput(b), ticketProjection })).toThrowError(/^ticket_projection_invalida$/);
    expect(() => computeEventSettlementTotals(projected)).toThrowError(/^ticket_projection_invalida$/);
    expect(() => computeStatementEngine(projected)).toThrowError(/^ticket_projection_invalida$/);
    expect(() => buildPartnerStatement(projected, SUPPLIER)).toThrowError(/^ticket_projection_invalida$/);
  });

  it("compara ao cêntimo sem recusar ruído binário de 0,1 + 0,2", () => {
    const p = projection();
    p.gross = p.net = 0.3;
    p.lines = p.lines.map((l, i) => ({ ...l, gross: i ? 0.2 : 0.1, net: i ? 0.2 : 0.1 }));
    expect(computeSettlementRevenue({ ticketProjection: p }).revenueNet).toBe(0.3);
  });

  it("aceita totais finitos exactamente iguais sem impor um teto monetário", () => {
    const p = projection();
    p.gross = 1e308;
    p.lines = p.lines.map((l, i) => ({ ...l, gross: i ? 0 : p.gross }));
    expect(computeSettlementRevenue({ ticketProjection: p }).revenueGross).toBe(p.gross);
  });
});

describe("#646 D2-d C5 — reconciliação do sócio e perímetros", () => {
  it("usa a classificação canónica também ao retirar 1.1.01 dos exclusivos", () => {
    const b = childBundle({
      transactions: [tx(" 1.1.01.02 ", 99, { event_settlement_id: CHILD })],
      ticketProjection: projection(),
    });
    expect(computeSettlementRevenue(revenueInput(b)).excludedTicketingTx).toStrictEqual(b.transactions);
    expect(computeStatementEngine(b).nodes.find(n => n.id === CHILD)!.perimeter.revenueNet).toBe(0);
    expect(buildPartnerStatement(b, SUPPLIER)!.doc.extras).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Receitas exclusivas da sociedade" }),
    ]));
  });

  it.each([false, true])("reconcilia receita, parte e residual com nó filho: %s", child => {
    const b = (child ? childBundle : bundle)({
      transactions: [
        ...bundle().transactions,
        tx("1.1.01", 100.01, { event_settlement_id: child ? CHILD : null }),
        tx("1.3.01", 40),
        tx("1.3.04", 70.11, { excluded_from_partner_settlement: true }),
        ...(child ? [tx("1.2.01", 15, { event_settlement_id: CHILD })] : []),
      ],
    });
    const projected = { ...b, ticketProjection: projection() };
    const totals = computeEventSettlementTotals(projected);
    const engine = computeStatementEngine(projected);
    const before = buildPartnerStatement(b, SUPPLIER)!;
    const after = buildPartnerStatement(projected, SUPPLIER)!;
    const node = engine.nodes.find(n => n.id === (child ? CHILD : ROOT))!;
    expect(totals.settlementRevenueNet).toBe(child ? 355.03 : 340.03);
    expect(roundCents(totals.revenueNet)).toBe(child ? 425.14 : 410.14);
    expect(after.block.account.share).toBe(child ? 53.97 : 95.94);
    expect(after.block.account.share).toBe(node.participants.find(p => p.kind === "partner")!.share);
    expect(roundCents(after.block.account.share - before.block.account.share)).toBe(child ? 20 : 80);
    expect(roundCents(after.doc.revenues.reduce((sum, line) => sum + line.net, 0))).toBe(340.03);
    expect(roundCents(after.block.account.share + after.block.account.financingToReturn - after.block.account.extrasTotal))
      .toBe(after.block.account.transferBase);
    expect(engine.house.houseOnlyRevenue).toBe(70.11);
    expect(roundCents(engine.partnersPaidTotal + engine.house.residual)).toBe(engine.eventNetResult);
    expect(engine.c1.value).toBe(0);
    expect(engine.c2.value).toBe(0);
    if (child) {
      expect(node.perimeter.revenueNet).toBe(15);
      expect(after.doc.extras?.find(e => e.label === "Receitas exclusivas da sociedade")?.items)
        .toStrictEqual([{ label: "Real 1.2.01", value: 15 }]);
    }
  });
});

describe("#646 D2-d C6 — perímetro estrutural, sem activação em produto", () => {
  it("lê os chamadores conhecidos e todas as fontes de produto fora dos três módulos", () => {
    const root = resolve(__dirname, "../..");
    const known = [
      "src/hooks/useTreasuryBridge.ts", "src/hooks/useEventSettlementEngine.ts", "src/hooks/useEventContractResult.ts",
      "src/components/EventFecho.tsx", "src/components/PartnerSettlementTab.tsx",
      "src/lib/partner-settlement-report.ts", "src/lib/partner-settlement-internal-report.ts",
      "src/lib/export-partner-settlement-internal-pdf.ts", "src/lib/export-partner-statement-doc.ts",
      "supabase/functions/financial-position/index.ts", "supabase/functions/partner-statement/index.ts",
    ];
    const allowed = new Set([
      "supabase/functions/_shared/settlement/settlement-revenue.ts",
      "supabase/functions/_shared/settlement/event-settlement-inputs.ts",
      "supabase/functions/_shared/settlement/statement-service.ts",
    ]);
    const productSources = (dir: string): string[] => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(entry => {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return /^(?:test|__tests__)$/.test(entry.name) ? [] : productSources(name);
      return /\.[cm]?[jt]sx?$/.test(name) && !/(?:[._](?:test|spec))\.[^.]+$/.test(name) ? [name] : [];
    });
    const files = new Set([...known, ...productSources("src"), ...productSources("supabase/functions")]);
    for (const file of files) {
      if (!allowed.has(file)) expect(readFileSync(resolve(root, file), "utf8"), file).not.toMatch(/\bticketProjection\b/);
    }
    expect(files.size).toBeGreaterThan(known.length);
  });
});
