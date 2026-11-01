import { describe, it, expect } from "vitest";
import {
  buildDeductionDocumentRows,
  groupTransactionsByFile,
  listDeductionsWithoutDocument,
} from "@/lib/settlement-deduction-documents";

describe("buildDeductionDocumentRows (#397)", () => {
  it("1 ficheiro → N registos com o mesmo caminho e is_accounting=true", () => {
    const rows = buildDeductionDocumentRows({
      filePath: "co/ft-6102.pdf",
      fileName: "ft-6102.pdf",
      uploadedBy: "a@b.pt",
      transactionIds: ["t1", "t2", "t3"],
      alreadyDocumented: new Set(),
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.file_url))).toEqual(new Set(["co/ft-6102.pdf"]));
    expect(rows.every((r) => r.is_accounting === true && r.doc_type === "pdf")).toBe(true);
    expect(rows.map((r) => r.transaction_id)).toEqual(["t1", "t2", "t3"]);
  });

  it("salta as que já têm documento e ids repetidos", () => {
    const rows = buildDeductionDocumentRows({
      filePath: "p",
      fileName: "x.pdf",
      uploadedBy: "u",
      transactionIds: ["t1", "t2", "t2", "t3"],
      alreadyDocumented: new Set(["t1"]),
    });
    expect(rows.map((r) => r.transaction_id)).toEqual(["t2", "t3"]);
  });

  it("tudo já documentado → nenhum registo", () => {
    expect(
      buildDeductionDocumentRows({
        filePath: "p",
        fileName: "x.pdf",
        uploadedBy: "u",
        transactionIds: ["t1"],
        alreadyDocumented: new Set(["t1"]),
      }),
    ).toEqual([]);
  });
});

describe("groupTransactionsByFile (#397)", () => {
  it("um grupo por ficheiro distinto, sem as já documentadas", () => {
    const a = { n: "a" };
    const b = { n: "b" };
    const m = new Map([
      ["t1", a],
      ["t2", a],
      ["t3", b],
      ["t4", b],
    ]);
    const g = groupTransactionsByFile(m, new Set(["t4"]));
    expect(g).toEqual([
      { file: a, transactionIds: ["t1", "t2"] },
      { file: b, transactionIds: ["t3"] },
    ]);
  });
});

describe("listDeductionsWithoutDocument (#397)", () => {
  const ded = [
    { id: "t1", gross: 10 },
    { id: "t2", gross: 20 },
    { id: "t3", gross: 30 },
    { id: "t4", gross: 40 },
  ];
  it("só seleccionadas, sem documento gravado nem ficheiro pendente", () => {
    const out = listDeductionsWithoutDocument(
      ded,
      new Set(["t1", "t2", "t3"]),
      new Set(["t1"]),
      new Set(["t2"]),
    );
    expect(out.map((d) => d.id)).toEqual(["t3"]);
  });
  it("vazia quando tudo coberto", () => {
    expect(
      listDeductionsWithoutDocument(ded, new Set(["t1"]), new Set(["t1"]), new Set()),
    ).toEqual([]);
  });
});
