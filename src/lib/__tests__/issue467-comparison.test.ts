import { describe, expect, it, vi } from "vitest";
import { buildMultiDiff, mapComparisonSnapshots, type ForecastSnapshot } from "../bp-version-multi-diff";
import { normalizeOrigin, originDisplayLines } from "../bp-version-origin";
import fixture from "./fixtures/issue467-snapshots.json";
import { exportBPMultiVersionComparisonPDF } from "../export-bp-version-multi-comparison-pdf";

const pdf = vi.hoisted(() => ({ tables: [] as any[], save: vi.fn() }));
vi.mock("jspdf", () => ({ default: class {
  lastAutoTable = { finalY: 150 };
  setFontSize() {} setFont() {} text() {} save = pdf.save;
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, table: unknown) => pdf.tables.push(table) }));
const base = fixture.v1.forecasts[0] as ForecastSnapshot;
function compare(a: Partial<ForecastSnapshot>, b: Partial<ForecastSnapshot>, count = 2) {
  const versions = Array.from({ length: count }, (_, i) => ({ id: "v" + i, label: "v" + i }));
  const snapshotsByVersion = Object.fromEntries(versions.map((v, i) => [v.id, [{ ...base, ...(i === count - 1 ? b : a) }]]));
  return buildMultiDiff({ versions, snapshotsByVersion, lookup: {} });
}

describe("#467 origin metadata comparison", () => {
  it.each([
    ["currency", "USD"], ["original_amount", "110.00000000000000001"],
    ["fx_rate", "0.18181800000000001"], ["fx_rate_source", "fixture-b"],
  ])("detects isolated %s changes at constant EUR in 2–4 versions", (field, value) => {
    for (const count of [2, 3, 4]) {
      const result = compare({}, { [field]: value }, count);
      const row = result.groups[0].rows[0];
      expect(row.hasDifferences).toBe(true);
      expect(row.changedOriginFields).toEqual([field]);
      expect(row.cells.map(c => c.amount)).toEqual(Array(count).fill(20));
      expect(result.summary.expense).toEqual(Array(count).fill(20));
      expect(originDisplayLines(row.cells[count - 1].origin, row.changedOriginFields).join("\n")).toContain("(alterado)");
    }
  });

  it.each(["original_amount", "fx_rate"] as const)("normalizes equivalent numbers, retaining exact %s and zero", field => {
    expect(compare({ [field]: 20 }, { [field]: "20.00" }).groups[0].rows[0].hasDifferences).toBe(false);
    expect(compare({ [field]: "2e1" }, { [field]: "20.000" }).groups[0].rows[0].hasDifferences).toBe(false);
    expect(compare({ [field]: 0 }, { [field]: "0.00" }).groups[0].rows[0].hasDifferences).toBe(false);
    expect(compare({ [field]: 0 }, { [field]: null }).groups[0].rows[0].changedOriginFields).toEqual([field]);
    expect(compare({ [field]: undefined }, { [field]: null }).groups[0].rows[0].hasDifferences).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, "Infinity", "20oops", "", " ", true, [], {}])("does not coerce invalid numeric metadata %j into zero or valid", value => {
    const result = compare({ original_amount: 0 }, { original_amount: value });
    const row = result.groups[0].rows[0];
    expect(row.changedOriginFields).toEqual(["original_amount"]);
    expect(row.cells[1].origin.original_amount.state).toBe("invalid");
    expect(originDisplayLines(row.cells[1].origin, row.changedOriginFields).join("\n")).toContain("Original (alterado): Inválido");
  });

  it("preserves missing fields without currency/FX defaults; missing row remains distinct", () => {
    expect(normalizeOrigin({})).toEqual(normalizeOrigin({ currency: null, original_amount: null, fx_rate: null, fx_rate_source: null }));
    expect(originDisplayLines(normalizeOrigin({}), [])).toEqual([]);
    const row = compare({ currency: undefined }, { currency: "BRL" }).groups[0].rows[0];
    expect(originDisplayLines(row.cells[0].origin, row.changedOriginFields)).toContain("Moeda (alterado): Não informado");
    const result = buildMultiDiff({ versions: [{ id: "a", label: "a" }, { id: "b", label: "b" }], snapshotsByVersion: { a: [{ ...base, amount: 0 }], b: [] }, lookup: {} });
    expect(result.groups[0].rows[0].cells.map(c => c.amount)).toEqual([0, null]);
    expect(result.groups[0].rows[0].hasDifferences).toBe(true);
  });

  it.each([23, 21])("keeps legacy EUR summaries/grouping unchanged for PT/ES IVA %s", iva_rate => {
    const versions = [{ id: "v1", label: "v1" }, { id: "v2", label: "v2" }];
    const mapped = mapComparisonSnapshots(versions, fixture as unknown as Record<string, { forecasts: ForecastSnapshot[] }>);
    const snapshots = Object.fromEntries(Object.entries(mapped).map(([id, rows]) => [id, rows.map(row => ({ ...row, iva_rate }))]));
    const result = buildMultiDiff({ versions, snapshotsByVersion: snapshots, lookup: {} });
    const legacy = Object.fromEntries(Object.entries(snapshots).map(([id, rows]) => [id, rows.map(({ currency, original_amount, fx_rate, fx_rate_source, ...row }) => row)]));
    const old = buildMultiDiff({ versions, snapshotsByVersion: legacy, lookup: {} });
    expect(result.summary).toEqual(old.summary);
    expect(result.groups.map(g => [g.groupCode, g.totalsBase])).toEqual(old.groups.map(g => [g.groupCode, g.totalsBase]));
    expect(old.groups[0].rows.every(r => !r.hasDifferences)).toBe(true);
    expect(result.summary).toMatchObject({ income: [100, 100], expense: [20, 20], result: [80, 80] });
  });

  it("renders real mapped diffs in PDF with per-version fields/reasons and respects only differences", () => {
    const versions = [{ id: "v1", label: "v1" }, { id: "v2", label: "v2" }];
    const result = buildMultiDiff({ versions, snapshotsByVersion: mapComparisonSnapshots(versions, fixture as unknown as Record<string, { forecasts: ForecastSnapshot[] }>), lookup: {} });
    pdf.tables.length = 0;
    exportBPMultiVersionComparisonPDF({ eventName: "Fictício", result, showOnlyDifferences: true });
    const detail = pdf.tables[1].body;
    const line = detail.find((r: any[]) => r[1] === "Serviço fictício");
    expect(line[2]).toContain("Original (alterado): 110");
    expect(line[3]).toContain("Original (alterado): 120.00");
    expect(line[2]).toContain("Taxa FX (alterado): 0.181818");
    expect(line[3]).toContain("Fonte FX (alterado): fixture-b");
    expect(line[2]).toContain("Moeda: BRL");
    expect(JSON.stringify(detail)).not.toContain("Receita fictícia");
    exportBPMultiVersionComparisonPDF({ eventName: "Fictício", result, showOnlyDifferences: false });
    expect(JSON.stringify(pdf.tables[3].body)).toContain("Receita fictícia");
    expect(pdf.save).toHaveBeenCalled();
  });
});
