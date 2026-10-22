import { describe, it, expect, vi } from "vitest";
import {
  applyBankLineOffset,
  buildBankOffsetItems,
  readOffsetControl,
  reverseOffsetGroup,
  translateOffsetError,
  type OffsetRpcClient,
} from "../rpc";
import { buildOffsetPlan, eurosToCents as e } from "../index";
import { grossCents, transactionSnapshot } from "../load";

function mockClient(opts: { rpc?: any; group?: any } = {}) {
  const rpc = vi.fn(opts.rpc ?? (async () => ({ data: null, error: null })));
  const from = vi.fn((table: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () =>
        ({ data: opts.group ?? null, error: null }),
    };
    return q;
  });
  return { rpc, from } as unknown as OffsetRpcClient & { rpc: ReturnType<typeof vi.fn> };
}

// Caso Estoril: linha +23.406; receita 30.996 (settle) e despesa 7.590 (offset)
const plan = buildOffsetPlan({ amount_cents: e(23406), direction: "in" }, [
  { id: "b873559f", kind: "transaction", sign: "income", open_cents: e(30996) },
  { id: "0368bca9", kind: "transaction", sign: "expense", open_cents: e(7590) },
]);

describe("payload do reconcile_bank_line (modo offset)", () => {
  it("é exacto: ids, modo, cash_order, expected_open_cents; request/supplier no 1.º item; nunca valores", async () => {
    const c = mockClient({ group: { id: "g1", status: "applied", movement_amount: "23406.00", operation_date: "2026-10-13", supplier_id: "s1", bank_line_id: "L1" } });
    const r = await applyBankLineOffset(c, { lineId: "L1", requestId: "R1", supplierId: "s1", items: plan.contract_items });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith("reconcile_bank_line", {
      p_line_id: "L1",
      p_items: [
        { request_id: "R1", supplier_id: "s1", transaction_id: "b873559f", mode: "settle", cash_order: 1, expected_open_cents: 3099600 },
        { transaction_id: "0368bca9", mode: "offset", cash_order: null, expected_open_cents: 759000 },
      ],
    });
    const sent = JSON.stringify(c.rpc.mock.calls[0][1]);
    expect(sent).not.toMatch(/"(amount|paid_amount|iva_rate|account_id|date)"/);
    expect(r.ok && r.group?.movement_amount).toBe(23406);
  });

  it("linha de BP vai como forecast_id", () => {
    const p = buildBankOffsetItems([{ forecast_id: "f1", mode: "offset", cash_order: null, expected_open_cents: 100 }], "R", "S");
    expect(p[0]).toEqual({ request_id: "R", supplier_id: "S", forecast_id: "f1", mode: "offset", cash_order: null, expected_open_cents: 100 });
  });
});

describe("tradução de erros", () => {
  it("'código: detalhe'", () => {
    const f = translateOffsetError({ message: "too_many_items: máximo 50 documentos por encontro", code: "P0001" });
    expect(f.code).toBe("too_many_items");
    expect(f.message).toBe("Máximo de 50 documentos por encontro.");
  });
  it("encontro_desativado", () =>
    expect(translateOffsetError({ message: "encontro_desativado", code: "P0001" }).message).toBe(
      "Encontros de contas estão temporariamente desativados.",
    ));
  it("preview_changed e encontro_em_conflito obrigam a recarregar", () => {
    expect(translateOffsetError({ message: "preview_changed", code: "P0001" }).reload).toBe(true);
    expect(translateOffsetError({ message: "encontro_em_conflito: operação concorrente", code: "55P03" }).reload).toBe(true);
    expect(translateOffsetError({ message: "permission_denied", code: "P0001" }).reload).toBe(false);
  });
  it("Faltam/Excedem do núcleo", () => {
    expect(translateOffsetError({ message: "Faltam 0,01 €", code: "P0001" }).message).toBe("Faltam 0,01 €");
    expect(translateOffsetError({ message: "Excedem 5,00 €", code: "P0001" }).message).toBe("Excedem 5,00 €; corrija a transação ou o BP");
  });
  it("código PG não mapeado → genérica com o código", () => {
    const f = translateOffsetError({ message: "insert or update violates foreign key", code: "23503" });
    expect(f.message).toContain("23503");
  });
  it("falha de rede = incerta", () => {
    const f = translateOffsetError({ message: "TypeError: Failed to fetch" });
    expect(f.uncertain).toBe(true);
  });
});

describe("recuperação por request_id", () => {
  it("após resposta incerta, repetir com o mesmo request_id e mesmo payload", async () => {
    let n = 0;
    const c = mockClient({
      rpc: async () => (++n === 1 ? { data: null, error: { message: "Failed to fetch" } } : { data: null, error: null }),
      group: { id: "g1", status: "applied", movement_amount: "1", operation_date: "2026-10-13", supplier_id: "s", bank_line_id: "L" },
    });
    const args = { lineId: "L", requestId: "R-same", supplierId: "s", items: plan.contract_items };
    const a = await applyBankLineOffset(c, args);
    expect(a.ok).toBe(false);
    expect((a as any).uncertain).toBe(true);
    const b = await applyBankLineOffset(c, args);
    expect(b.ok).toBe(true);
    expect(c.rpc.mock.calls[0][1]).toEqual(c.rpc.mock.calls[1][1]);
  });
});

describe("controlo e estorno", () => {
  const ctl = (resp: any) => {
    const c = mockClient({ rpc: async () => resp });
    return c;
  };
  it.each([
    ["N0 array", { data: [{ enabled: true, reverse_enabled: true }], error: null }, { enabled: true, reverse_enabled: true, readable: true }],
    ["N1 array", { data: [{ enabled: false, reverse_enabled: true }], error: null }, { enabled: false, reverse_enabled: true, readable: true }],
    ["N2 array", { data: [{ enabled: false, reverse_enabled: false }], error: null }, { enabled: false, reverse_enabled: false, readable: true }],
    ["objecto único", { data: { enabled: false, reverse_enabled: true }, error: null }, { enabled: false, reverse_enabled: true, readable: true }],
    ["erro", { data: null, error: { message: "permission denied" } }, { enabled: false, reverse_enabled: false, readable: false }],
    ["vazio []", { data: [], error: null }, { enabled: false, reverse_enabled: false, readable: false }],
    ["null", { data: null, error: null }, { enabled: false, reverse_enabled: false, readable: false }],
    ["2 linhas", { data: [{ enabled: true, reverse_enabled: true }, { enabled: true, reverse_enabled: true }], error: null }, { enabled: false, reverse_enabled: false, readable: false }],
    ["string", { data: [{ enabled: "true", reverse_enabled: true }], error: null }, { enabled: false, reverse_enabled: false, readable: false }],
    ["null em campo", { data: [{ enabled: null, reverse_enabled: true }], error: null }, { enabled: false, reverse_enabled: false, readable: false }],
    ["campo em falta", { data: { enabled: true }, error: null }, { enabled: false, reverse_enabled: false, readable: false }],
  ])("controlo %s", async (_n, resp, expected) => {
    const c = ctl(resp);
    expect(await readOffsetControl(c)).toEqual(expected);
    expect(c.rpc).toHaveBeenCalledWith("transaction_offset_control_status", {});
    expect((c as any).from).not.toHaveBeenCalled();
  });
  it("excepção no rpc = fechado e nunca lê a tabela", async () => {
    const c = mockClient({ rpc: async () => { throw new Error("network"); } });
    expect(await readOffsetControl(c)).toEqual({ enabled: false, reverse_enabled: false, readable: false });
    expect((c as any).from).not.toHaveBeenCalledWith("transaction_offset_control");
  });
  it("estorno: motivo obrigatório, não chama o servidor", async () => {
    const c = mockClient();
    const r = await reverseOffsetGroup(c, { groupId: "g", requestId: "r", reason: "  " });
    expect(r.ok).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("estorno: payload exacto", async () => {
    const c = mockClient({ rpc: async () => ({ data: { status: "reversed" }, error: null }) });
    await reverseOffsetGroup(c, { groupId: "g", requestId: "r", reason: "erro" });
    expect(c.rpc).toHaveBeenCalledWith("transaction_offset_reverse", { p_group_id: "g", p_request_id: "r", p_reason: "erro" });
  });
});

describe("leitura: bruto e elegibilidade", () => {
  it("bruto igual ao núcleo (round(base*(1+iva/100),2))", () => {
    expect(grossCents(1000000, 23)).toBe(1230000);
    expect(grossCents(1, 23)).toBe(1); // 0,0123 → 0,01
    expect(grossCents(3, 23)).toBe(4); // 0,0369 → 0,04
  });
  it("conta inconsistente detectada", () => {
    const { snap } = transactionSnapshot(
      { id: "t", amount: 100, iva_rate: 0, account_id: "A", currency: "EUR" },
      [{ status: "paid", reversed_at: null, amount: 10, payment_method: "transfer", account_id: "B" }],
      new Set(),
    );
    expect(snap.cash_account_inconsistent).toBe(true);
    expect(snap.open_amount).toBe(90);
  });
});
