import { describe, it, expect, vi } from "vitest";
import { buildLaunchOffsetPlan, buildLaunchMovement, validateLaunchMoney } from "../launch";
import { applyLaunchOffset, buildLaunchOffsetItems } from "../rpc";
import type { OffsetDocumentInput } from "../index";

const doc = (id: string, sign: "income" | "expense", cents: number): OffsetDocumentInput => ({
  id, kind: "transaction", sign, open_cents: cents, expected_open_cents: cents,
});
const money = (amount_cents: number, direction: "in" | "out" = "in") => ({ account_id: "acc", date: "2026-10-22", amount_cents, direction });

describe("#337 3a — prévia fora do banco", () => {
  it("com dinheiro: Estoril 30.996 − 7.590 = 23.406 a entrar", () => {
    const p = buildLaunchOffsetPlan(money(2340600), [doc("r", "income", 3099600), doc("d", "expense", 759000)]);
    expect(p.ok).toBe(true);
    expect(p.items.find((i) => i.document_id === "r")).toMatchObject({ mode: "settle", cash_cents: 2340600, offset_cents: 759000, cash_order: 1 });
    expect(p.items.find((i) => i.document_id === "d")).toMatchObject({ mode: "offset", cash_cents: 0, offset_cents: 759000, cash_order: null });
  });

  it("sem dinheiro: 7.590 contra 7.590, tudo 'offset' sem cash_order", () => {
    const p = buildLaunchOffsetPlan(null, [doc("r", "income", 759000), doc("d", "expense", 759000)]);
    expect(p.ok).toBe(true);
    expect(p.contract_items.every((c) => c.mode === "offset" && c.cash_order === null)).toBe(true);
    expect(p.totals?.movement_cents).toBe(0);
  });

  it("sem dinheiro e desigual: recusa com a diferença", () => {
    const p = buildLaunchOffsetPlan(null, [doc("r", "income", 759001), doc("d", "expense", 759000)]);
    expect(p.ok).toBe(false);
    expect(p.errors[0].code).toBe("amount_mismatch");
    expect(p.errors[0].message).toContain("0,01 €");
  });

  it("débito simétrico: dinheiro sai e liquida despesas", () => {
    const p = buildLaunchOffsetPlan(money(1000, "out"), [doc("r", "income", 500), doc("d", "expense", 1500)]);
    expect(p.ok).toBe(true);
    expect(p.items.find((i) => i.document_id === "d")).toMatchObject({ mode: "settle", cash_cents: 1000, offset_cents: 500 });
    expect(p.items.find((i) => i.document_id === "r")).toMatchObject({ mode: "offset", offset_cents: 500 });
  });

  it("dívida parcial: o dinheiro reparte pela ordem até esgotar", () => {
    const docs = [doc("a", "income", 1000), doc("b", "income", 1000), doc("d", "expense", 500)];
    const p = buildLaunchOffsetPlan(money(1500), docs, ["b", "a"]);
    expect(p.ok).toBe(true);
    expect(p.items.find((i) => i.document_id === "b")).toMatchObject({ cash_cents: 1000, cash_order: 1 });
    expect(p.items.find((i) => i.document_id === "a")).toMatchObject({ cash_cents: 500, offset_cents: 500, cash_order: 2 });
  });

  it("arredondamento 0,01 € com dinheiro: falta 1 cêntimo recusa", () => {
    const p = buildLaunchOffsetPlan(money(2340601), [doc("r", "income", 3099600), doc("d", "expense", 759000)]);
    expect(p.ok).toBe(false);
    expect(p.errors[0].message).toContain("0,01 €");
  });

  it("50 itens passam, 51 recusam (com e sem dinheiro)", () => {
    const fifty = [...Array(25)].flatMap((_, i) => [doc(`r${i}`, "income", 100), doc(`d${i}`, "expense", 100)]);
    expect(buildLaunchOffsetPlan(null, fifty).ok).toBe(true);
    const fiftyOne = [...fifty, doc("x", "income", 1)];
    expect(buildLaunchOffsetPlan(null, fiftyOne).errors[0].code).toBe("too_many_items");
    expect(buildLaunchOffsetPlan(money(1), fiftyOne).errors[0].code).toBe("too_many_items");
  });

  it("os dois sinais são obrigatórios (com e sem dinheiro)", () => {
    expect(buildLaunchOffsetPlan(null, [doc("a", "income", 100), doc("b", "income", 100)]).errors[0].code).toBe("both_signs_required");
    expect(buildLaunchOffsetPlan(money(200), [doc("a", "income", 100), doc("b", "income", 100)]).errors[0].code).toBe("both_signs_required");
  });

  it("p_movement: null sem dinheiro; amount assinado em euros com dinheiro", () => {
    expect(buildLaunchMovement(null)).toBeNull();
    expect(buildLaunchMovement(money(2340600))).toEqual({ account_id: "acc", date: "2026-10-22", amount: 23406 });
    expect(buildLaunchMovement(money(1234, "out"))).toEqual({ account_id: "acc", date: "2026-10-22", amount: -12.34 });
  });

  it("validação do dinheiro: conta obrigatória, data não futura, valor > 0", () => {
    expect(validateLaunchMoney(null, "2026-10-22")).toBeNull();
    expect(validateLaunchMoney({ ...money(100), account_id: "" }, "2026-10-22")).toMatch(/conta/);
    expect(validateLaunchMoney({ ...money(100), date: "2026-10-23" }, "2026-10-22")).toMatch(/futura/);
    expect(validateLaunchMoney(money(0), "2026-10-22")).toBeTruthy();
    expect(validateLaunchMoney(money(100), "2026-10-22")).toBeNull();
  });
});

describe("#337 — chamada a transaction_offset_execute", () => {
  it("envia só ids/modo/ordem/expected_open_cents e os 6 argumentos", async () => {
    const rpc = vi.fn(async () => ({ data: { group_id: "g" }, error: null }));
    const maybeSingle = vi.fn(async () => ({ data: { id: "g", status: "applied", movement_amount: "0", operation_date: "2026-10-22", supplier_id: "s", bank_line_id: null }, error: null }));
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
    const r = await applyLaunchOffset({ rpc, from } as any, {
      requestId: "req", supplierId: "s", date: "2026-10-22", note: null, movement: null,
      items: [{ transaction_id: "r", mode: "offset", cash_order: null, expected_open_cents: 759000 }],
    });
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("transaction_offset_execute", {
      p_request_id: "req", p_supplier_id: "s", p_movement: null, p_date: "2026-10-22", p_note: null,
      p_items: [{ transaction_id: "r", mode: "offset", cash_order: null, expected_open_cents: 759000 }],
    });
    expect(JSON.stringify(buildLaunchOffsetItems([{ forecast_id: "f", mode: "settle", cash_order: 1, expected_open_cents: 1 }]))).not.toMatch(/amount"|paid_amount|iva_rate/);
  });

  it.each([
    ["encontro_desativado", "temporariamente desativados"],
    ["preview_changed: x", "mudou desde a prévia"],
    ["account_not_allowed", "Esta conta não pode"],
    ["both_signs_required", "receita e uma despesa"],
  ])("erro %s traduzido em pt-PT", async (raw, text) => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: raw, code: "P0001" } }));
    const r = await applyLaunchOffset({ rpc, from: vi.fn() } as any, { requestId: "q", supplierId: "s", date: "2026-10-22", note: null, movement: null, items: [] });
    expect(r.ok).toBe(false);
    expect((r as any).message).toContain(text);
  });
});
