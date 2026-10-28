// @vitest-environment node
// 0286: o payMutation do detalhe da nota cria a transação de pagamento já com
// exclude_from_result = true (o custo vive nos itens; a trigger na nota é a 2.ª linha).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("src/components/ReimbursementNoteDetail.tsx", "utf8");

describe("0286 — modal cria pagamento fora do resultado", () => {
  it("o insert da transação de pagamento envia exclude_from_result: true", () => {
    const i = SRC.indexOf('.from("transactions")');
    expect(i).toBeGreaterThan(-1);
    const block = SRC.slice(i, i + 800);
    expect(block).toContain(".insert(");
    expect(block).toContain('type: "expense"');
    expect(block).toContain("exclude_from_result: true");
  });
  it("a ligação à nota mantém payment_transaction_id (dispara a trigger da 0286)", () => {
    expect(SRC).toContain("payment_transaction_id: paymentTx.id");
  });
});
