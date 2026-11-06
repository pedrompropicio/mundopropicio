import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { loadTicketOfficeStatements, useTicketOfficeStatements, type TicketOfficeStatementsReadClient } from "@/hooks/useTicketOfficeStatements";
import { loadRetainedComposition, useRetainedComposition } from "@/hooks/useRetainedComposition";
import { issue303Config, issue303Feature } from "./fixtures/issue303-statement";

const scope = vi.hoisted(() => ({ companyId: "company-a", user: { id: "user-a" }, client: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => scope.client.from(table), rpc: (name: string) => scope.client.rpc(name) } }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: scope.companyId }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: scope.user }) }));
import { ticketOfficePosition } from "@/lib/ticket-office-position";
import { computeTicketOfficeBalance, decomposeTicketOfficeRetained } from "@/lib/ticket-office-balance";

const events = [
  { id: "event-open", name: "Open", balance: 300.25 },
  { id: "event-draft", name: "Draft", balance: 22.5 },
  { id: "event-confirmed", name: "Confirmed", balance: 100 },
  { id: "event-settled", name: "Settled", balance: 50 },
  { id: "event-zero", name: "Zero", balance: 0 },
];
const legacyStatements = [
  { id: "draft", number: "S2", statement_date: "2030-02-02", document_total: "-12.34", status: "draft",
    ticket_office_statement_lines: [{ id: "draft-line", line_type: "event_right", position: 1, description: "Draft quota", amount: "22.50", event_id: "event-draft" }] },
  { id: "confirmed", number: "S1", statement_date: "2030-02-01", document_total: "10.00", status: "confirmed",
    ticket_office_statement_lines: [{ id: "confirmed-line", line_type: "event_right", position: 0, description: "Final quota", amount: "100.00", event_id: "event-confirmed" }] },
];
const balanceInput = {
  officeId: "account-a", assignedEventIds: ["event-open", "event-draft"],
  sales: [{ event_id: "event-open", financial_account_id: "account-a", total_value: 500.25, quantity: 1, unit_price: 500.25 },
    { event_id: "event-draft", financial_account_id: "account-a", total_value: 22.5, quantity: 1, unit_price: 22.5 }],
  transactions: [{ account_id: "account-a", event_id: "event-open", type: "expense", status: "paid", paid_amount: 200 }],
  advances: [{ amount: 5, transaction_id: "legacy-paid", settlement_id: "legacy-closed" }],
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function legacyConsumers() {
  return {
    balance: computeTicketOfficeBalance(balanceInput),
    position: ticketOfficePosition(events, ["event-settled"], ["event-draft", "event-confirmed"], -12.34, 322.75),
    decomposition: decomposeTicketOfficeRetained({ globalBalance: 322.75, events, statements: legacyStatements, settledEventIds: ["event-settled"] }),
  };
}

describe("#303 R5 read contract", () => {
  it("pins legacy consumer bytes before implementation", () => {
    expect(hash(legacyConsumers())).toBe("96ce0cf5ff59b12edbaf4ba103184e9016f19f5c7ddba98f29d283c9090b7d8d");
  });
});

const H = "a".repeat(64), AT = "2030-02-01T12:00:00Z";
function line(id: string, statementId: string, kind = "event_sales", eventId: string | null = "event-confirmed") {
  return { id, statement_id: statementId, company_id: "company-a", line_type: kind === "event_sales" ? "event_right" : kind === "opening_balance" ? "carry_over" : kind,
    position: 0, description: `Synthetic ${id}`, amount: "100.00", event_id: eventId, document_line_type: kind,
    source_sha256: H, document_page: 1, document_line_ref: id,
    opening_note: null, opening_created_by: null, opening_created_at: null,
    adjusts_statement_id: null, adjusts_line_id: null, adjustment_reason: null } as Record<string, any>;
}
function header(id: string, status = "confirmed", date = "2030-02-01") {
  return { id, company_id: "company-a", financial_account_id: "account-a", number: id, statement_date: date,
    document_total: "60.00", status, contract_version: 2, revision: 1,
    position_cutoff_at: `${date}T03:00:00Z`, position_timezone: "America/Fortaleza", position_cutoff_source: "company_day_end",
    predecessor_statement_id: null, primary_document_id: `pdf-${id}`, primary_document_sha256: H,
    confirmation_receipt: null, opening_balance_line_id: null } as Record<string, any>;
}
function freeze(h: Record<string, any>, lines: Record<string, any>[]) {
  const opening = lines.find((l) => l.document_line_type === "opening_balance");
  h.opening_balance_line_id = opening?.id ?? null;
  h.confirmation_receipt = {
    contract_version: 2, statement_id: h.id, revision: h.revision, calculated_total: h.document_total,
    independent_position: h.document_total, sources: [{ kind: "synthetic-source", sha256: H }],
    confirmed_by: "admin-a", confirmed_at: AT, opening_approved: !!opening,
    opening: opening ? { line_id: opening.id, amount: opening.amount, note: opening.opening_note,
      prepared_by: opening.opening_created_by, prepared_at: opening.opening_created_at,
      approved_by: "admin-a", approved_at: AT } : null,
    lines: structuredClone(lines), documents: [{ document_id: h.primary_document_id, sha256: H }],
    position_proof: { validator: "issue303-r4-v1", contract_version: 2, statement_id: h.id, revision: h.revision,
      position_cutoff_at: h.position_cutoff_at, position_timezone: h.position_timezone, position_cutoff_source: h.position_cutoff_source,
      primary_document_sha256: H, independent_position: h.document_total, sources: [{ kind: "synthetic-source", sha256: H }] },
  };
}
function v2Data() {
  const first = header("first"), correction = header("correction", "confirmed", "2030-02-02"), draft = header("draft", "draft", "2030-02-03");
  const sales = line("sales-first", "first");
  const opening = { ...line("opening-first", "first", "opening_balance", null), position: 1, amount: "-40.00",
    opening_note: "Synthetic opening reviewed", opening_created_by: "preparer-a", opening_created_at: AT };
  const adjustment = { ...line("correction-line", "correction", "ticketline_invoice"), amount: "-5.00",
    adjusts_statement_id: "first", adjusts_line_id: "sales-first", adjustment_reason: "Synthetic late invoice" };
  const carry = { ...line("carry", "correction", "carry_over", null), amount: "60.00", position: 1, previous_statement_id: "first" };
  correction.document_total = "55.00"; correction.predecessor_statement_id = "first";
  correction.position_cutoff_source = "pdf_explicit";
  draft.document_total = "999.00";
  freeze(first, [sales, opening]); freeze(correction, [adjustment, carry]);
  return {
    ticket_office_statements: [draft, correction, first],
    ticket_office_statement_lines: [sales, opening, adjustment, carry, line("draft-quota", "draft", "event_sales", "event-draft")],
    ticket_office_statement_events: [{ event_id: "event-confirmed", statement_id: "first", quota_line_id: "sales-first",
      company_id: "company-a", financial_account_id: "account-a", created_by: "admin-a", created_at: AT }],
  };
}
type Tables = Record<string, Record<string, any>[]>;
type Call = { table: string; select: string; filters: [string, unknown][]; range?: number[]; orders: string[] };
function clientFixture(options: { enabled?: boolean; feature?: Record<string, any> | null; data?: Tables;
  error?: (call: Call) => unknown } = {}) {
  const tables: Tables = {
    company_features: options.feature === null ? [] : [{ company_id: "company-a", ...issue303Feature,
      config: issue303Config, enabled: options.enabled ?? true, ...options.feature }],
    ...(options.enabled === false ? { ticket_office_statements: structuredClone(legacyStatements) } : v2Data()),
    event_ticket_office_assignments: events.map((e) => ({ event_id: e.id, financial_account_id: "account-a", events: { id: e.id, name: e.name } })),
    rpc_sales: events.map((e) => ({ event_id: e.id, quantity: 1, revenue: e.balance })),
    transactions: [{ id: "account-movement", account_id: "account-a", event_id: null, type: "expense", status: "paid", paid_amount: 150 }], event_ticket_office_advances: [], ticket_office_settlements: [{ event_id: "event-settled", financial_account_id: "account-a" }],
    ...options.data,
  };
  // The legacy SELECT omits account columns; supply them only in the fake database.
  tables.ticket_office_statements.forEach((s) => { s.financial_account_id ??= "account-a"; });
  const calls: Call[] = [];
  const client: TicketOfficeStatementsReadClient = {
    rpc: vi.fn(async (name) => {
      if (name === "current_company_id") return { data: "company-a", error: null };
      if (name === "get_ticket_office_sales") return { data: tables.rpc_sales, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }),
    from(table) {
      const call: Call = { table, select: "", filters: [], orders: [] };
      const predicates: ((row: any) => boolean)[] = [], orders: { key: string; asc: boolean }[] = [];
      let single = false;
      const run = () => {
        calls.push(structuredClone(call));
        const error = options.error?.(call);
        if (error) return { data: null, error };
        let rows = (tables[table] ?? []).filter((row) => predicates.every((predicate) => predicate(row)));
        rows = [...rows].sort((a, b) => {
          for (const { key, asc } of orders) {
            const comparison = String(a[key]).localeCompare(String(b[key]));
            if (comparison) return asc ? comparison : -comparison;
          }
          return 0;
        });
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        if (call.select.includes("!")) rows = rows.map((r) => Object.fromEntries(
          ["id", "number", "statement_date", "document_total", "status", "ticket_office_statement_lines"].map((k) => [k, r[k]])));
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      const query = {
        select(value: string) { call.select = value; return query; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); predicates.push((row) => row[key] === value); return query; },
        is(key: string, value: unknown) { predicates.push((row) => (row[key] ?? null) === value); return query; },
        in(key: string, values: unknown[]) { predicates.push((row) => values.includes(row[key])); return query; },
        order(key: string, opts?: { ascending?: boolean }) { call.orders.push(key); orders.push({ key, asc: opts?.ascending ?? true }); return query; },
        range(from: number, to: number) { call.range = [from, to]; return query; },
        maybeSingle() { single = true; return query; },
        then<TResult1 = ReturnType<typeof run>, TResult2 = never>(
          resolve?: (value: ReturnType<typeof run>) => TResult1 | PromiseLike<TResult1>,
          reject?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
        ) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return query;
    },
  };
  return { client, calls, tables };
}
async function read(f: ReturnType<typeof clientFixture>, account = "account-a") {
  return loadTicketOfficeStatements(account, { companyId: "company-a", client: f.client });
}
afterEach(() => { scope.companyId = "company-a"; scope.user = { id: "user-a" }; });

describe("#303 R5 session reads without network", () => {
  it.each(["off", "absent", "account-off", "invalid"])("%s preserves the legacy SELECT and fixed consumer hash", async (mode) => {
    const feature = mode === "absent" ? null : mode === "account-off"
      ? { enabled: true, config: { accounts: [{ financial_account_id: "account-a", enabled: false, contract_version: 2 }] } }
      : mode === "invalid" ? { enabled: true, config: { accounts: [] } } : undefined;
    const f = clientFixture({ enabled: false, feature });
    const result = await read(f);
    expect(result.status).toBe("legacy");
    if (result.status !== "legacy") throw new Error("Expected legacy");
    expect(JSON.stringify(result.statements)).toBe(JSON.stringify(legacyStatements));
    const consumers = legacyConsumers();
    consumers.decomposition = decomposeTicketOfficeRetained({ globalBalance: 322.75, events,
      statements: result.statements, settledEventIds: ["event-settled"] });
    expect(hash(consumers)).toBe("96ce0cf5ff59b12edbaf4ba103184e9016f19f5c7ddba98f29d283c9090b7d8d");
    expect(f.calls.map((c) => c.table)).toEqual(["company_features", "ticket_office_statements"]);
    expect(f.calls[1].select).toBe("id, number, statement_date, document_total, status, ticket_office_statement_lines!ticket_office_statement_lines_statement_id_fkey(id, line_type, position, description, amount, event_id)");
  });
  it("separates confirmed v2, drafts and v1 history; exposes server cutoff, timezone and receipt", async () => {
    const f = clientFixture();
    const old = { ...header("legacy"), contract_version: 1, confirmation_receipt: null };
    f.tables.ticket_office_statements.push(old);
    const result = await read(f);
    expect(result.status).toBe("v2");
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.confirmedStatements.map((s) => s.id)).toEqual(["correction", "first"]);
    expect(result.draftStatements.map((s) => s.id)).toEqual(["draft"]);
    expect(result.legacyStatements.map((s) => s.id)).toEqual(["legacy"]);
    expect(result.statements).toBe(result.confirmedStatements);
    expect(result.confirmedStatements[0].provenance.cutoff).toEqual({ at: "2030-02-02T03:00:00Z", timezone: "America/Fortaleza", source: "pdf_explicit" });
    expect(result.confirmedStatements[1].provenance.cutoff?.source).toBe("company_day_end");
    expect(result.confirmedStatements[0].provenance.primaryDocument).toEqual({ id: "pdf-correction", sha256: H });
    expect(result.confirmedStatements[0].provenance.receipt).toEqual({ source: "server_confirmation_receipt", value: f.tables.ticket_office_statements[1].confirmation_receipt });
    expect(result.draftStatements[0].provenance.receipt).toBeNull();
    expect(result.provenance.eventMemberships).toHaveLength(1);
    expect(result.confirmedStatements[1].ticket_office_statement_lines[0].line_type).toBe("event_right");
    expect(result.confirmedStatements[1].ticket_office_statement_lines[0].document_line_type).toBe("event_sales");
    expect(result.confirmedStatements[1].ticket_office_statement_lines[1].document_line_type).toBe("opening_balance");
    expect(f.calls.filter((c) => c.table !== "company_features").every((c) => c.filters.some(([key, v]) => key === "company_id" && v === "company-a"))).toBe(true);
  });
  it("retains canonical historical memberships without treating legacy documents as confirmed v2", async () => {
    const f = clientFixture();
    const old: Record<string, any> = { ...header("legacy-final", "confirmed", "2030-02-10"), contract_version: 1 };
    const quota: Record<string, any> = { ...line("legacy-quota", old.id, "event_sales", "event-legacy"), document_line_type: null };
    f.tables.ticket_office_statements.push(old); f.tables.ticket_office_statement_lines.push(quota);
    f.tables.ticket_office_statement_events.push({ event_id: "event-legacy", statement_id: old.id, quota_line_id: quota.id,
      company_id: "company-a", financial_account_id: "account-a", created_by: "admin-a", created_at: AT });
    const result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.provenance.latestConfirmedStatementId).toBe("correction");
    expect(result.provenance.eventMemberships.map((m) => m.event_id)).toEqual(["event-confirmed", "event-legacy"]);
    expect(result.legacyStatements[0].ticket_office_statement_lines[0].line_type).toBe("event_right");
  });
  it("projects Q2 approval and Q4 origin from the frozen receipt without changing membership", async () => {
    const f = clientFixture();
    // Mutable fetched detail is not the source of confirmed documentary provenance.
    f.tables.ticket_office_statement_lines[1].opening_note = "Not the frozen note";
    f.tables.ticket_office_statement_lines[2].adjustment_reason = "Not the frozen reason";
    const result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.confirmedStatements[1].provenance.opening).toEqual({ lineId: "opening-first", amount: -40,
      note: "Synthetic opening reviewed", preparedBy: "preparer-a", preparedAt: AT,
      approval: { approvedBy: "admin-a", approvedAt: AT } });
    expect(result.confirmedStatements[0].provenance.adjustments).toEqual([{ lineId: "correction-line",
      originalStatementId: "first", originalLineId: "sales-first", reason: "Synthetic late invoice", eventId: "event-confirmed",
      sourceSha256: H, documentPage: 1, documentLineRef: "correction-line" }]);
    expect(result.provenance.eventMemberships.map((m) => [m.event_id, m.statement_id])).toEqual([["event-confirmed", "first"]]);
  });
  it("reuses retained decomposition; draft quota and Q4 do not close another event", async () => {
    const f = clientFixture(), result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    const input = { globalBalance: 322.75, events, statements: result.statements,
      settledEventIds: ["event-settled"], provenance: result.provenance };
    const decomposition = decomposeTicketOfficeRetained(input)!;
    expect(decomposition.position).toBe(55);
    expect(decomposition.openEvents.map((e) => e.id)).toEqual(["event-open", "event-draft"]);
    expect(decomposition.openTotal).toBe(322.75); expect(decomposition.residual).toBe(-55);
    expect(decomposition.statementLines.map((l) => l.id)).toEqual(["correction-line", "carry"]);
    const position = ticketOfficePosition(events, ["event-settled"], ["event-draft"], 999, 322.75, result.provenance);
    expect(position.position).toBe(55); expect(position.calendarDifference).toBe(-55);
    expect(position.provenance).toBe(result.provenance);
    expect(position.openEvents.map((e) => e.id)).toEqual(["event-open", "event-draft", "event-zero"]);
    const loaded = await loadRetainedComposition("account-a", { companyId: "company-a", client: f.client });
    expect(loaded.decomposition).toEqual(decomposition);
    expect(loaded.statementsRead?.status).toBe("v2");
  });
  it("no confirmed v2 never chooses a draft or a v1 document", async () => {
    const f = clientFixture();
    f.tables.ticket_office_statements = [f.tables.ticket_office_statements[0], { ...header("old"), contract_version: 1 }];
    f.tables.ticket_office_statement_lines = [f.tables.ticket_office_statement_lines[4]];
    f.tables.ticket_office_statement_events = [];
    const result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.provenance.latestConfirmedStatementId).toBeNull();
    expect(decomposeTicketOfficeRetained({ globalBalance: 1, events, statements: result.draftStatements,
      settledEventIds: [], provenance: result.provenance })).toBeNull();
    expect(ticketOfficePosition(events, [], [], 999, 1, result.provenance).position).toBe(0);
  });
  it.each(["42703", "42883", "42P01", "PGRST200", "PGRST202", "PGRST204", "PGRST205"])("missing server capability %s is explicit and never falls back", async (code) => {
    const f = clientFixture({ error: (c) => c.table === "ticket_office_statements" ? { code } : null });
    expect(await read(f)).toEqual({ status: "v2_unavailable", message: "capacidade v2 indisponível", cause: { code } });
    expect(f.calls.filter((c) => c.table === "ticket_office_statements").every((c) => !c.select.includes("!"))).toBe(true);
    const loaded = await loadRetainedComposition("account-a", { companyId: "company-a", client: f.client });
    expect(loaded.decomposition).toBeNull(); expect(loaded.statementsRead?.status).toBe("v2_unavailable");
  });
  it.each(["ticket_office_statement_lines", "ticket_office_statement_events"])("missing %s prevents partial v2 results", async (table) => {
    const f = clientFixture({ error: (c) => c.table === table ? { code: "42703" } : null });
    expect((await read(f)).status).toBe("v2_unavailable");
  });
  it.each(["company_features", "ticket_office_statements"])("permission and transport errors in %s do not become an empty/legacy success", async (table) => {
    const error = { code: "42501", message: "Synthetic denial" };
    const f = clientFixture({ error: (c) => c.table === table ? error : null });
    await expect(read(f)).rejects.toEqual(error);
    expect(f.calls.some((c) => c.select.includes("!"))).toBe(false);
  });
  it.each(["duplicate", "missing", "draft", "cross-company", "wrong-quota", "receipt", "cutoff", "opening"])("rejects inconsistent %s evidence", async (kind) => {
    const f = clientFixture();
    const members = f.tables.ticket_office_statement_events, h = f.tables.ticket_office_statements[2];
    if (kind === "duplicate") members.push({ ...members[0] });
    if (kind === "missing") members.pop();
    if (kind === "draft") members[0].statement_id = "draft";
    if (kind === "cross-company") members[0].company_id = "company-b";
    if (kind === "wrong-quota") members[0].quota_line_id = "opening-first";
    if (kind === "receipt") h.confirmation_receipt.statement_id = "another-statement";
    if (kind === "cutoff") h.confirmation_receipt.position_proof.position_cutoff_at = "2030-01-31T03:00:00Z";
    if (kind === "opening") h.confirmation_receipt.opening_approved = false;
    await expect(read(f)).rejects.toThrow();
  });
  it("resolves company from the session for standalone loader calls and preserves legacy composition bytes", async () => {
    const f = clientFixture({ enabled: false });
    // Same synthetic balances used for the before hash.
    const loaded = await loadRetainedComposition("account-a", { client: f.client });
    const expected = { accountId: "account-a", globalBalance: 322.75,
      decomposition: decomposeTicketOfficeRetained({ globalBalance: 322.75, events, statements: legacyStatements, settledEventIds: ["event-settled"] }) };
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(expected));
    expect(f.client.rpc).toHaveBeenCalledWith("current_company_id");
    expect(Object.keys(loaded)).toEqual(["accountId", "globalBalance", "decomposition"]);
  });
  it("paginates more than 1000 lines without trusting embedded detail", async () => {
    const f = clientFixture();
    const draft = f.tables.ticket_office_statements[0];
    f.tables.ticket_office_statements = [draft]; f.tables.ticket_office_statement_events = [];
    f.tables.ticket_office_statement_lines = Array.from({ length: 1001 }, (_, n) => ({
      ...line(`line-${String(n).padStart(4, "0")}`, "draft", "advance", null), position: n,
    }));
    const result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.draftStatements[0].ticket_office_statement_lines).toHaveLength(1001);
    expect(f.calls.filter((c) => c.table === "ticket_office_statement_lines").map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
  });
  it("paginates headers, memberships and quota lines without losing confirmed events", async () => {
    const f = clientFixture();
    const h = header("many-events"); h.document_total = "100100.00";
    const quotas: Record<string, any>[] = Array.from({ length: 1001 }, (_, n) => ({
      ...line(`quota-${n}`, h.id, "event_sales", `event-${n}`), position: n,
    }));
    freeze(h, quotas);
    const drafts = Array.from({ length: 1000 }, (_, n) => header(`empty-draft-${n}`, "draft"));
    f.tables.ticket_office_statements = [h, ...drafts]; f.tables.ticket_office_statement_lines = quotas;
    f.tables.ticket_office_statement_events = quotas.map((l) => ({ event_id: l.event_id, statement_id: h.id, quota_line_id: l.id,
      company_id: "company-a", financial_account_id: "account-a", created_by: "admin-a", created_at: AT }));
    const result = await read(f);
    if (result.status !== "v2") throw new Error("Expected v2");
    expect(result.confirmedStatements).toHaveLength(1); expect(result.draftStatements).toHaveLength(1000);
    expect(result.provenance.eventMemberships).toHaveLength(1001);
    for (const table of ["ticket_office_statements", "ticket_office_statement_events"]) {
      expect(f.calls.filter((c) => c.table === table).map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
    }
  });
  it("an empty account still detects unavailable canonical line columns", async () => {
    const f = clientFixture({ data: { ticket_office_statements: [], ticket_office_statement_lines: [], ticket_office_statement_events: [] },
      error: (c) => c.table === "ticket_office_statement_lines" ? { code: "42703" } : null });
    expect((await read(f)).status).toBe("v2_unavailable");
  });
  it("never returns the first 50000 rows as a complete read", async () => {
    const f = clientFixture();
    const realFrom = f.client.from;
    const fullPage = Array(1000).fill(header("untrusted-repeated-row"));
    f.client.from = (table) => {
      if (table !== "ticket_office_statements") return realFrom(table);
      const q = { select: () => q, eq: () => q, order: () => q,
        range: vi.fn(async () => ({ data: fullPage, error: null })) };
      return q as unknown as ReturnType<TicketOfficeStatementsReadClient["from"]>;
    };
    await expect(read(f)).rejects.toThrow("limite de paginação");
  });
  it("hooks scope caches by session user and active company", async () => {
    scope.client = clientFixture().client;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const statements = renderHook(() => useTicketOfficeStatements("account-a"), { wrapper });
    const retained = renderHook(() => useRetainedComposition(["account-a"], true), { wrapper });
    await waitFor(() => expect(statements.result.current.isSuccess && retained.result.current.isSuccess).toBe(true));
    expect(qc.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([
      ["ticket-office-statements", "company-a", "user-a", "account-a"],
      ["financial-position-retained-composition", "company-a", "user-a", ["account-a"]],
    ]);
    scope.user = { id: "user-b" }; scope.companyId = "company-b";
    statements.rerender(); retained.rerender();
    expect(statements.result.current.data).toBeUndefined(); expect(retained.result.current.data).toBeUndefined();
    statements.unmount(); retained.unmount(); qc.clear();
  });
});
