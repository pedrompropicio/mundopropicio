import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { buildCommittedRows, buildCommittedBpDoc } from "@/lib/export-bp-committed-pdf";
import logo from "@/assets/logo-horizontal.png?inline";

const bundle = JSON.parse(fs.readFileSync("/tmp/anitta-bundle.json", "utf8"));

describe("BP previsto+excedido — Anitta", () => {
  it("valida", () => {
    const { rows, totals } = buildCommittedRows(bundle);
    console.log("TOTAL s/IVA", totals.base.toFixed(2), "IVA", totals.iva.toFixed(2), "c/IVA", totals.total.toFixed(2), "docs", totals.docs);
    const aereo = rows.filter((r: any) => r.code === "2.2.01");
    const idx = rows.findIndex((r: any) => r.code === "2.2.01");
    console.log("2.2.01 rubrica", JSON.stringify(aereo));
    console.log("linhas seguintes", JSON.stringify(rows.slice(idx + 1, idx + 4)));
    const doc = buildCommittedBpDoc(bundle, { displayName: "Mundo Propício", logoDataUrl: logo as string });
    fs.writeFileSync("/tmp/bp-anitta.pdf", Buffer.from(doc.output("arraybuffer") as ArrayBuffer));
    expect(totals.base).toBeGreaterThan(0);
  });
});
