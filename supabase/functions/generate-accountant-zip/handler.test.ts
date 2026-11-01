import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  company: "00000000-0000-0000-0000-000000000001",
  id: "00000000-0000-0000-0000-000000000002",
  otherId: "00000000-0000-0000-0000-000000000003",
  managerialId: "00000000-0000-0000-0000-000000000004",
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  audit: vi.fn(),
  upload: vi.fn(),
  files: new Map<string, unknown>(),
}));

vi.mock("npm:@supabase/supabase-js@2", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "caller" } }, error: null }) },
    rpc: state.audit,
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      let selectedIds: string[] | undefined;
      for (const method of ["select", "eq", "gte", "lte", "or", "order", "limit", "range", "in"]) {
        query[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args });
          if (method === "in" && args[0] === "id") selectedIds = args[1] as string[];
          return query;
        };
      }
      query.then = (resolve: (value: unknown) => void) => {
        let data: unknown[] = [];
        if (table === "user_roles") data = [{ role: "accountant", company_id: state.company }];
        if (table === "financial_accounts") data = [{ id: "managerial" }];
        if (table === "transactions") {
          data = [
            { id: state.id, company_id: state.company, account_id: null, amount: 100, payment_date: "2020-01-01" },
            { id: state.otherId, company_id: "foreign", account_id: null, amount: 100 },
            { id: state.managerialId, company_id: state.company, account_id: "managerial", amount: 100 },
          ].filter((t) => !selectedIds || selectedIds.includes(t.id));
        }
        resolve({ data, error: null });
      };
      return query;
    },
    storage: { from: () => ({
      upload: state.upload,
      createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/archive.zip" }, error: null }),
      download: async () => ({ data: null, error: null }),
    }) },
  }),
}));

vi.mock("npm:jszip@3.10.1", () => ({
  default: class {
    file(name: string, data: unknown) { state.files.set(name, data); }
    async generateAsync() { return new Uint8Array([1, 2, 3]); }
  },
}));

let handler: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: () => "local-test-only" },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import("./index");
});
beforeEach(() => {
  state.calls.length = 0;
  state.files.clear();
  state.audit.mockReset().mockResolvedValue({ data: "audit-id", error: null });
  state.upload.mockReset().mockResolvedValue({ error: null });
});
afterAll(() => vi.unstubAllGlobals());

const request = (body: unknown) => new Request("http://localhost/zip", {
  method: "POST", headers: { Authorization: "Bearer local-test-only", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("#395 — handler local sem rede nem escrita real", () => {
  it("IDs prevalecem sobre período/filtros e a auditoria recebe zip_export", async () => {
    const response = await handler(request({ company_id: state.company,
      transaction_ids: [state.id, state.otherId, state.managerialId, "inválido"],
      period: { from: "2026-01-01", to: "2026-01-31" },
      filters: { type: "income", has_attachments: "with" },
    }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.transaction_count).toBe(1);
    expect(result.ignored_count).toBe(3);
    const csv = String(state.files.get("index.csv"));
    expect(csv).toContain(state.id);
    expect(csv).toContain("2020-01-01");
    expect(csv).not.toContain(state.otherId);
    expect(csv).not.toContain(state.managerialId);
    const txCalls = state.calls.filter((c) => c.table === "transactions");
    expect(txCalls.some((c) => ["gte", "lte", "or"].includes(c.method))).toBe(false);
    expect(txCalls).toContainEqual({ table: "transactions", method: "eq", args: ["company_id", state.company] });
    expect(state.audit).toHaveBeenCalledWith("record_document_download", expect.objectContaining({
      p_resource_type: "zip_export", p_period_from: null, p_period_to: null,
      p_extra: expect.objectContaining({ ignored_count: 3, selection_mode: "transaction_ids" }),
    }));
  });
  it("seleção vazia não cai no período nem lê transações", async () => {
    const response = await handler(request({ company_id: state.company, transaction_ids: [] }));
    expect(response.status).toBe(200);
    expect((await response.json()).transaction_count).toBe(0);
    expect(state.calls.some((c) => c.table === "transactions")).toBe(false);
  });
  it("501 IDs devolvem 400 e não consultam transações nem geram ZIP", async () => {
    const response = await handler(request({ company_id: state.company, transaction_ids: Array(501).fill(state.id) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Mais de 500 transações no período. Reduza o período.");
    expect(state.calls.some((c) => c.table === "transactions")).toBe(false);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("sem IDs conserva os predicados do período e filtros", async () => {
    const response = await handler(request({ company_id: state.company,
      period: { from: "2026-01-01", to: "2026-01-31" }, filters: { type: "expense" },
    }));
    expect(response.status).toBe(200);
    await response.json();
    expect(state.calls).toContainEqual({ table: "transactions", method: "gte", args: ["payment_date", "2026-01-01"] });
    expect(state.calls).toContainEqual({ table: "transactions", method: "lte", args: ["payment_date", "2026-01-31"] });
    expect(state.calls).toContainEqual({ table: "transactions", method: "eq", args: ["type", "expense"] });
    expect(state.calls).toContainEqual({ table: "transactions", method: "or", args: ["account_id.is.null,account_id.not.in.(managerial)"] });
  });
});