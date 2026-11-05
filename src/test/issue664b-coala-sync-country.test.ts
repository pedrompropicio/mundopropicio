import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoalaSync from "@/pages/admin/CoalaSync";
import { COUNTRIES } from "@/lib/crm/countries";

const f = vi.hoisted(() => ({ from: vi.fn(), writes: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));
vi.mock("@/hooks/useCompanyFeatures", () => ({ useHasFeature: () => true }));
vi.mock("@/components/coala/CoalaApplyButton", () => ({ default: () => null }));
vi.mock("@/components/coala/CostCenterMapPanel", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let client: QueryClient;
let config: any;
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client }, React.createElement(CoalaSync)));
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  f.writes = [];
  config = { id: "cfg", event_id: "event", drive_file_id: "file", enabled: true, file_label: "Fixture", new_supplier_country: null };
  f.from.mockImplementation(table => {
    if (table === "coala_sync_config") return {
      select: () => ({ order: async () => ({ data: [config], error: null }) }),
      update: (payload: any) => ({ eq: async (column: string, id: string) => {
        expect([column, id]).toEqual(["id", "cfg"]); f.writes.push(payload); Object.assign(config, payload); return { error: null };
      } }),
      insert: async (payload: any) => { f.writes.push(payload); return { error: null }; },
    };
    if (table === "coala_sync_runs") return { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    if (table === "events") return { select: (columns: string) => ({ eq: () => columns === "company_id"
      ? { single: async () => ({ data: { company_id: "company" }, error: null }) }
      : Promise.resolve({ data: [{ id: "event", name: "Evento" }], error: null }) }) };
    throw new Error(`Unexpected table ${table}`);
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network forbidden"); }));
});
afterEach(() => {
  cleanup(); client?.clear(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  if (scrollIntoViewDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
  else delete HTMLElement.prototype.scrollIntoView;
});

describe("#664b critério 3 — configuração explícita", () => {
  it("select começa vazio, partilha a lista do fornecedor e update grava ISO-2 e NULL ao limpar", async () => {
    mount();
    const select = await screen.findByLabelText("País dos fornecedores novos");
    expect(select).toHaveValue("");
    expect(within(select).getAllByRole("option").map(o => o.getAttribute("value"))).toEqual(["", ...Object.keys(COUNTRIES)]);
    expect(screen.getByText("fornecedores novos vão bloquear a sincronização")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "ES" } });
    await waitFor(() => expect(f.writes).toEqual([{ id: "cfg", new_supplier_country: "ES" }]));
    await waitFor(() => expect(select).toHaveValue("ES"));
    await waitFor(() => expect(select).not.toBeDisabled());
    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(f.writes[1]).toEqual({ id: "cfg", new_supplier_country: null }));
  }, 15000);
  it("nova configuração começa sem país", async () => {
    mount(); await screen.findByLabelText("País dos fornecedores novos");
    fireEvent.click(screen.getByRole("button", { name: "Nova configuração" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("País dos fornecedores novos")).toHaveValue("");
    expect(dialog.getByText("fornecedores novos vão bloquear a sincronização")).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });
  it.each(["", "BR"])("criação grava o país escolhido %s sem substituir o vazio", async country => {
    mount(); await screen.findByLabelText("País dos fornecedores novos");
    fireEvent.click(screen.getByRole("button", { name: "Nova configuração" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("País dos fornecedores novos"), { target: { value: country } });
    fireEvent.click(dialog.getAllByRole("combobox").find(el => el.tagName === "BUTTON")!);
    fireEvent.click(await screen.findByRole("option", { name: "Evento" }));
    fireEvent.change(dialog.getByPlaceholderText("1psA-GNOQd-1U2jlgQzV8ebXgGK6wM6jZjpXUmQVzLQA"), { target: { value: "file" } });
    fireEvent.click(dialog.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(f.writes).toEqual([expect.objectContaining({ new_supplier_country: country || null, company_id: "company", event_id: "event" })]));
  }, 15000);
});

const edgeSource = readFileSync("supabase/functions/sync-coala-from-drive/index.ts", "utf8");
type Mode = "auto_apply" | "apply" | "dry_run";
async function edgeFixture(mode: Mode, country: string | null = "ES") {
  let handler: (request: Request) => Promise<Response>;
  const writes: { table: string; operation: string; payload: any; id?: string }[] = [];
  const cfg = { id: "cfg", company_id: "company", event_id: "event", enabled: true, drive_file_id: "file", new_supplier_country: country };
  let runNumber = 0;
  const admin = { from: (table: string) => {
    let operation = "select", payload: any, selected = "", id: string | undefined;
    const resolve = () => {
      if (operation !== "select") {
        writes.push({ table, operation, payload, id });
        return { data: operation === "insert" && table === "coala_sync_runs" ? { id: `run${++runNumber}` } : null, error: null };
      }
      if (table === "coala_sync_config") return { data: id ? cfg : [cfg], error: null };
      if (table === "coala_sync_runs") return { data: selected.includes("xlsx_sha256") ? null : { id: "base", config_id: "cfg", diff: { original: true } }, error: null };
      if (["coala_sync_row_state", "coala_sync_decisions"].includes(table)) return { data: [], error: null };
      throw new Error(`Unexpected table ${table}`);
    };
    const q: any = {
      select: (columns: string) => { selected = columns; return q; },
      insert: (value: any) => { operation = "insert"; payload = value; return q; },
      update: (value: any) => { operation = "update"; payload = value; return q; },
      delete: () => { operation = "delete"; return q; },
      eq: (column: string, value: string) => { if (column === "id") id = value; return q; },
      in: () => q, order: () => q, limit: () => q,
      single: async () => resolve(), maybeSingle: async () => resolve(),
      then: (yes: any, no: any) => Promise.resolve(resolve()).then(yes, no),
    }; return q;
  } };
  const calls: any[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fake-token" });
    if (url.includes("googleapis.com/drive/") && url.includes("fields=")) return Response.json({ modifiedTime: "2026-11-05T00:00:00Z" });
    if (url.includes("googleapis.com/drive/") && url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]));
    if (url === "https://fixture.invalid/functions/v1/apply-coala-bp") {
      const body = JSON.parse(String(options?.body)); calls.push(body);
      if (body.phase === "compare") return Response.json({ ok: true, summary: { severity: { auto: 1, review: 0 } } });
      return Response.json({ ok: true, summary: {}, audit: {} });
    }
    throw new Error(`Unexpected network request ${url}`);
  });
  const source = edgeSource.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/export const /g, "const ");
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(script, {
    createClient: () => admin, isServiceRoleRequest: async () => true,
    assertCallerRoleOnRow: () => { throw new Error("Unexpected user guard"); }, errorResponse: () => { throw new Error("Unexpected auth error"); },
    parseCoalaXlsx: () => ({ rows: [], fileVersion: "fixture" }), buildValidationReport: () => ({}),
    Deno: { env: { get: (name: string) => name === "SUPABASE_URL" ? "https://fixture.invalid" : "fake-secret" }, serve: (fn: typeof handler) => { handler = fn; } },
    fetch: fetcher, Response, Request, URLSearchParams, crypto: webcrypto, btoa,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  });
  const response = await handler!(new Request("https://fixture.invalid/sync", { method: "POST", body: JSON.stringify({
    mode, configId: "cfg", ...(mode === "auto_apply" ? { basedOnRunId: "base" } : {}),
  }) }));
  return { response, result: await response.json(), calls, writes };
}

describe("#664b critério 2 — handler real, fetch simulado", () => {
  it.each(["auto_apply", "apply", "dry_run"] as const)("%s propaga só o país da configuração na chamada escritora", async mode => {
    const f = await edgeFixture(mode, "ES");
    expect(f.response.status).toBe(200);
    const writers = f.calls.filter(c => c.phase !== "compare");
    expect(writers).toHaveLength(1);
    expect(writers[0]).toMatchObject({ newSupplierCountry: "ES", phase: mode === "apply" ? "reset_reimport" : "auto_apply" });
    for (const c of f.calls.filter(c => c.phase === "compare")) expect(c).not.toHaveProperty("newSupplierCountry");
  });
  it.each(["auto_apply", "apply", "dry_run"] as const)("%s preserva NULL sem preencher um país silenciosamente", async mode => {
    const f = await edgeFixture(mode, null);
    expect(f.response.status).toBe(200);
    expect(f.calls.filter(c => c.phase !== "compare")).toEqual([expect.objectContaining({ newSupplierCountry: null })]);
  });
  it("não lê companies.country nem usa IBAN como fonte", () => {
    expect(edgeSource).not.toMatch(/\.from\(["']companies["']\)|companies\.country|\biban\b/i);
    expect(edgeSource.match(/newSupplierCountry: cfg\.new_supplier_country \?\? null/g)).toHaveLength(3);
  });
});

const missingCountrySuppliers = ["FORNECEDOR Á", "FORNECEDOR B"];

// Fixture adicional: mantém os casos anteriores e simula duas configurações no cron.
async function countryResponseFixture(mode: Mode, status = 400, error = "supplier_country_required") {
  const cron = mode !== "auto_apply";
  let handler: (request: Request) => Promise<Response>;
  const configs = [
    { id: "cfg", event_id: "event", drive_file_id: "file", new_supplier_country: null },
    { id: "cfg-next", event_id: "event-next", drive_file_id: "file-next", new_supplier_country: "ES" },
  ].map(c => ({ ...c, company_id: "company", enabled: true, last_modified_time: "2026-11-01T00:00:00Z" }));
  const writes: { table: string; operation: string; payload?: any; id?: string }[] = [];
  const runs = new Map<string, any>([["base", { id: "base", config_id: "cfg", status: "success", diff: { original: true } }]]);
  let runNumber = 0;
  const admin = { from: (table: string) => {
    let operation = "select", payload: any, selected = "";
    const filters = new Map<string, unknown>();
    const resolve = () => {
      const id = filters.get("id") as string | undefined;
      if (operation !== "select") {
        writes.push({ table, operation, payload, id: id ?? filters.get("config_id") as string | undefined });
        if (table === "coala_sync_runs") {
          if (operation === "insert") {
            const run = { id: `run${++runNumber}`, ...payload };
            runs.set(run.id, run);
            return { data: { id: run.id }, error: null };
          }
          if (!id || !runs.has(id)) throw new Error(`Unexpected run update ${id}`);
          Object.assign(runs.get(id), payload);
        } else if (table === "coala_sync_config") {
          const cfg = configs.find(c => c.id === id);
          if (!cfg) throw new Error(`Unexpected config update ${id}`);
          Object.assign(cfg, payload);
        } else if (table !== "coala_sync_row_state") throw new Error(`Unexpected write ${table}`);
        return { data: null, error: null };
      }
      if (table === "coala_sync_config") return { data: id ? configs.find(c => c.id === id) : configs, error: null };
      if (table === "coala_sync_runs") return { data: selected.includes("xlsx_sha256") ? null : runs.get(id!), error: null };
      if (["coala_sync_row_state", "coala_sync_decisions"].includes(table)) return { data: [], error: null };
      throw new Error(`Unexpected table ${table}`);
    };
    const q: any = {
      select: (columns: string) => { selected = columns; return q; },
      insert: (value: any) => { operation = "insert"; payload = value; return q; },
      update: (value: any) => { operation = "update"; payload = value; return q; },
      delete: () => { operation = "delete"; return q; },
      eq: (column: string, value: unknown) => { filters.set(column, value); return q; },
      in: () => q, order: () => q, limit: () => q,
      single: async () => resolve(), maybeSingle: async () => resolve(),
      then: (yes: any, no: any) => Promise.resolve(resolve()).then(yes, no),
    }; return q;
  } };
  const calls: any[] = [];
  const failure = { error, missingSuppliers: missingCountrySuppliers };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fake-token" });
    if (url.includes("googleapis.com/drive/") && url.includes("fields=")) return Response.json({ modifiedTime: "2026-11-05T00:00:00Z" });
    if (url.includes("googleapis.com/drive/") && url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]));
    if (url === "https://fixture.invalid/functions/v1/apply-coala-bp") {
      const body = JSON.parse(String(options?.body)); calls.push(body);
      if (body.phase === "compare") return Response.json({ ok: true, summary: { severity: { auto: 1, review: 0 } } });
      if (body.eventId === "event") return Response.json(failure, { status });
      return Response.json({ ok: true, summary: {}, audit: {} });
    }
    throw new Error(`Unexpected network request ${url}`);
  });
  const source = edgeSource.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/export const /g, "const ");
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(script, {
    createClient: () => admin, isServiceRoleRequest: async () => !cron,
    assertCallerRoleOnRow: () => { throw new Error("Unexpected user guard"); }, errorResponse: () => { throw new Error("Unexpected auth error"); },
    parseCoalaXlsx: () => ({ rows: [], fileVersion: "fixture" }), buildValidationReport: () => ({}),
    Deno: { env: { get: (name: string) => name === "SUPABASE_URL" ? "https://fixture.invalid" : "fake-secret" }, serve: (fn: typeof handler) => { handler = fn; } },
    fetch: fetcher, Response, Request, URLSearchParams, crypto: webcrypto, btoa,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  });
  const response = await handler!(new Request("https://fixture.invalid/sync", {
    method: "POST", headers: cron ? { "x-cron-secret": "fake-secret" } : {},
    body: JSON.stringify({ mode, ...(cron ? {} : { configId: "cfg", basedOnRunId: "base" }) }),
  }));
  return { response, result: await response.json(), calls, writes, runs, configs, failure };
}

describe("#664 E2b — supplier_country_required nas três chamadas escritoras", () => {
  it.each(["auto_apply", "apply", "dry_run"] as const)("%s grava blocked, conserva fornecedores e permite continuar o cron", async mode => {
    const f = await countryResponseFixture(mode);
    expect(f.response.status).toBe(200);
    const blockedId = mode === "auto_apply" ? "base" : "run1";
    const diff = { reason: "supplier_country_required", missingSuppliers: missingCountrySuppliers };
    const runWrites = f.writes.filter(w => w.table === "coala_sync_runs" && w.operation === "update" && w.id === blockedId);
    expect(runWrites.at(-1)?.payload).toEqual({
      status: "blocked", error_message: "supplier_country_required", diff, finished_at: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(f.runs.get(blockedId).finished_at))).toBe(true);
    expect(f.runs.get(blockedId)).toMatchObject({ status: "blocked", error_message: "supplier_country_required", diff });
    expect(f.writes.filter(w => w.table === "coala_sync_config" && w.id === "cfg")).toEqual([{
      table: "coala_sync_config", operation: "update", id: "cfg",
      payload: { last_run_at: expect.any(String), last_run_status: "blocked_supplier_country" },
    }]);
    expect(f.configs[0].last_modified_time).toBe("2026-11-01T00:00:00Z");
    expect(f.writes.filter(w => w.table === "coala_sync_row_state" && w.id === "cfg")).toEqual([]);
    if (mode === "auto_apply") {
      expect(f.result).toEqual({ ok: true, status: "blocked", basedOnRunId: "base", ...diff });
      expect(f.writes.some(w => w.operation === "insert")).toBe(false);
    } else {
      expect(f.result.runs).toEqual([
        expect.objectContaining({ runId: "run1", configId: "cfg", status: "blocked", ...diff }),
        expect.objectContaining({ runId: "run2", configId: "cfg-next", status: mode === "apply" ? "success" : "auto_applied" }),
      ]);
      expect(f.runs.get("run2").triggered_by).toBe("cron");
      expect(f.calls.map(c => [c.eventId, c.phase])).toEqual([
        ["event", "compare"], ["event", mode === "apply" ? "reset_reimport" : "auto_apply"],
        ["event-next", "compare"], ["event-next", mode === "apply" ? "reset_reimport" : "auto_apply"],
      ]);
      const blockedConfigWrite = f.writes.findIndex(w => w.table === "coala_sync_config" && w.id === "cfg");
      const nextRunInsert = f.writes.findIndex(w => w.table === "coala_sync_runs" && w.operation === "insert" && w.payload.config_id === "cfg-next");
      expect(nextRunInsert).toBeGreaterThan(blockedConfigWrite);
      expect(f.configs[1]).toMatchObject({ last_run_status: mode === "apply" ? "success" : "auto_applied" });
    }
  });

  describe.each([
    { status: 400, error: "other_error" },
    { status: 500, error: "supplier_country_required" },
  ])("regressão HTTP $status com $error", ({ status, error }) => {
    it.each(["auto_apply", "apply", "dry_run"] as const)("%s conserva o comportamento anterior", async mode => {
      const f = await countryResponseFixture(mode, status, error);
      expect(f.writes.some(w => w.payload?.status === "blocked" || w.payload?.last_run_status === "blocked_supplier_country")).toBe(false);
      if (mode === "auto_apply") {
        expect(f.response.status).toBe(500);
        expect(f.result).toEqual({ error: "auto_apply falhou", detail: f.failure });
        expect(f.writes).toEqual([]);
        expect(f.runs.get("base")).toMatchObject({ status: "success", diff: { original: true } });
      } else {
        expect(f.response.status).toBe(200);
        if (mode === "apply") {
          const message = `apply-coala-bp falhou (${status}): ${JSON.stringify(f.failure)}`;
          expect(f.runs.get("run1")).toMatchObject({ status: "failed", error_message: message, finished_at: expect.any(String) });
          expect(f.result.runs[0]).toMatchObject({ status: "failed", error: message });
          expect(f.configs[0]).toMatchObject({ last_run_status: "failed" });
        } else {
          const escalation = { status: "auto_apply_failed", error: f.failure };
          expect(f.runs.get("run1")).toMatchObject({ status: "needs_review", diff: { escalation } });
          expect(f.runs.get("run1")).not.toHaveProperty("error_message");
          expect(f.result.runs[0]).toMatchObject({ status: "success", escalation });
          expect(f.configs[0]).toMatchObject({ last_run_status: "success" });
        }
        expect(f.configs[0].last_modified_time).toBe("2026-11-05T00:00:00Z");
        expect(f.result.runs[1]).toMatchObject({ configId: "cfg-next", status: mode === "apply" ? "success" : "auto_applied" });
      }
    });
  });
});
