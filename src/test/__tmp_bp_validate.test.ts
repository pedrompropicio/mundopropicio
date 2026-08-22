import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { buildCommittedRows } from "@/lib/export-bp-committed-pdf";
const bundle = JSON.parse(fs.readFileSync("/tmp/anitta-bundle.json", "utf8"));
describe("dbg", () => { it("2.2.05", () => {
  const cat = bundle.categories.find((c: any) => c.code === "2.2.05");
  const txs = bundle.transactions.filter((t: any) => t.category_id === cat.id);
  const docs = txs.reduce((s: number, t: any) => s + (bundle.txDocs[t.id] ?? 0), 0);
  console.log("txs no bundle", txs.length, "docs", docs);
  buildCommittedRows(bundle);
  expect(1).toBe(1);
});});
