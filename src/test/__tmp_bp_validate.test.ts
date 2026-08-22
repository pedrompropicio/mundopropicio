import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { buildCommittedRows } from "@/lib/export-bp-committed-pdf";
const bundle = JSON.parse(fs.readFileSync("/tmp/anitta-bundle.json", "utf8"));
describe("docs", () => { it("por rubrica", () => {
  const { rows, totals } = buildCommittedRows(bundle);
  const l3 = rows.filter((r: any) => r.kind === "l3").map((r: any) => `${r.code} ${r.docs}`);
  console.log("DOCS TOTAL", totals.docs);
  console.log(l3.filter((s: string) => !s.endsWith(" 0")).join("\n"));
  expect(1).toBe(1);
});});
