import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildTicketlineProposal, type ErpContext } from "../../supabase/functions/_shared/assistant-ticketline-proposal";
import { rpcExecutor, executionLinks, EXECUTOR_SCHEMA, type Executor } from "../../supabase/functions/_shared/assistant-executor";
import type { ReviewStore } from "../../supabase/functions/_shared/assistant-review-store";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";
import TicketlineExecutionPanel from "@/components/data-entry/TicketlineExecutionPanel";
import type { DataEntryAdapter } from "@/lib/data-entry-client";

const user = "11111111-1111-4111-8111-111111111111", company = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const event = "44444444-4444-4444-8444-444444444444", bank = "55555555-5555-4555-8555-555555555555", office = "66666666-6666-4666-8666-666666666666";
const authz = "77777777-7777-4777-8777-777777777777";
const st = { source_message_id: "msg000001", number: "AP-77", statement_date: "2026-10-10", document_total_cents: 57950,
  lines: [{ line_type: "event_right" as const, description: "Direito", amount_cents: 100000, event_hint: "Duo Sintético" }, { line_type: "ticketline_invoice" as const, description: "Fatura", amount_cents: -42050, event_hint: null }] };
const open: ErpContext = { company_id: company, events: [{ id: event, name: "Duo Sintético", date: "2026-10-09", sealed: false }], existing_statements: [] };

describe("#333 fase12e proposta: bilheteira escolhida por pessoa", () => {
  it("sem bilheteira a preparação fica bloqueada; com bilheteira entra nos efeitos e no hash", async () => {
    const none = await buildTicketlineProposal(st, open, { human_reviewed: true });
    expect(none.actions.find(a => a.id === "a1")?.blocked_reason).toMatch(/bilheteira/);
    const ok = await buildTicketlineProposal(st, open, { human_reviewed: true, office_account_id: office });
    expect(ok.effects.office).toBe(office); expect(ok.actions.find(a => a.id === "a1")?.blocked_reason).toBeNull();
    const other2 = await buildTicketlineProposal(st, open, { human_reviewed: true, office_account_id: bank });
    expect(other2.effects_hash).not.toBe(ok.effects_hash);
  });
});

describe("#333 fase12e cliente do executor", () => {
  it("só envia autorização+ação (sem efeitos/actor); probe exige esquema e gate", async () => {
    const calls: { token: string; args: Record<string, unknown> }[] = [];
    const ex = rpcExecutor(async (token, _n, args) => { calls.push({ token, args }); return args.p_mode === "probe" ? { data: { schema: EXECUTOR_SCHEMA, enabled: true }, error: null } : { data: { action_id: "a1", status: "succeeded", replayed: false, result: { statement_id: event, number: "AP-77", lines: 2 } }, error: null }; });
    await ex.probe("jwt-u"); const r = await ex.execute("jwt-u", authz, "a1");
    expect(r.result.lines).toBe(2);
    expect(calls[1]).toEqual({ token: "jwt-u", args: { p_mode: "execute", p_authorization: authz, p_action: "a1" } });
    await expect(rpcExecutor(async () => ({ data: { schema: "333-12d", enabled: true }, error: null })).probe("t")).rejects.toThrow(/indisponível/);
    await expect(rpcExecutor(async () => ({ data: { schema: EXECUTOR_SCHEMA, enabled: false }, error: null })).probe("t")).rejects.toThrow(/indisponível/);
  });
  it("recusas do SQL são definitivas; transporte perdido ou resposta estranha = incerto (sem repetição cega)", async () => {
    const refuse = (m: string) => rpcExecutor(async () => ({ data: null, error: { code: "P0001", message: `#333: ${m}` } }));
    await expect(refuse("dependency_pending").execute("t", authz, "a2")).rejects.toMatchObject({ status: 409, code: "dependency_pending" });
    await expect(refuse("event_sealed").execute("t", authz, "a1")).rejects.toThrow(/fecho confirmado/);
    await expect(refuse("duplicate_statement").execute("t", authz, "a1")).rejects.toThrow(/não foi duplicado/);
    await expect(refuse("data_changed").execute("t", authz, "a5")).rejects.toThrow(/mudaram/);
    await expect(rpcExecutor(async () => { throw new TypeError("network"); }).execute("t", authz, "a1")).rejects.toMatchObject({ status: 502 });
    await expect(rpcExecutor(async () => ({ data: null, error: { code: "57014", message: "canceling statement" } })).execute("t", authz, "a1")).rejects.toThrow(/incerto/);
    await expect(rpcExecutor(async () => ({ data: { action_id: "a2", status: "succeeded" }, error: null })).execute("t", authz, "a1")).rejects.toThrow(/incerto/);
  });
  it("links só a partir do resultado conferido", () => {
    expect(executionLinks({ action_id: "a5", result: { transfer_transaction_id: event } })).toEqual([{ label: "Transferência do fecho", href: `/transacoes?highlight=${event}` }]);
    expect(executionLinks({ action_id: "a4", result: { event_id: event } })[0].href).toBe(`/transacoes?event=${event}`);
    expect(executionLinks({ action_id: "a5", result: {} })).toEqual([]);
  });
});

const BODY = "Fecho do evento Duo Sintético\nDireito 1000 euros, fatura 420,50.\nTotal a transferir 579,50";
function deps(over: Partial<Deps> = {}) {
  const store: ReviewStore = { probe: vi.fn(async () => {}), save: vi.fn(async (_s, i) => ({ review_id: event, version: 1, effects_hash: i.proposal.effects_hash })), authorize: vi.fn(async () => ({ authorization_id: authz, replayed: false, status: "authorized_inert" as const, action_ids: ["a1"] })) };
  const reader = { search: vi.fn(async () => ({ messages: [{ message_id: "msg000001", from: "fechos@exemplo.invalid", subject: "Fecho", date: "2026-10-10", attachments: [] }], next_page_token: null })),
    read: vi.fn(async (id: string) => ({ message_id: id, from: "fechos@exemplo.invalid", subject: "Fecho", date: "2026-10-10", kind: "plain" as const, body_text: BODY, truncated: false })), attachment: vi.fn(), attachments: vi.fn(async () => []) };
  const steps = [{ type: "tool", name: "gmail_search", args: { from_date: "2026-10-01", to_date: "2026-10-19", sender: "exemplo.invalid", page_size: 10 } },
    { type: "tool", name: "gmail_read", args: { message_id: "msg000001" } },
    { type: "tool", name: "prepare_ticketline_proposal", args: { message_id: "msg000001", statement: { number: "AP-77", statement_date: "2026-10-10", document_total_cents: 57950, lines: st.lines } } }];
  let i = 0;
  const d: Deps = { uploadEnabled: false, cors: {}, continuationSecret: "s".repeat(40), today: () => "2026-10-20", assistantEnabled: true,
    getUser: async (t) => ({ id: t === "jwt-other" ? other : user }),
    userRpc: async () => ({ data: { role: "manager", company_id: company }, error: null }), recordReceipt: vi.fn(), storage: { upload: vi.fn(), download: vi.fn() },
    gmail: { reader: async () => reader } as never,
    assistant: { model: { next: async () => ({ step: steps[i++] as never, tokens: 10 }) }, erpContext: async () => open },
    ticketlineErp: { context: async () => open, accounts: async () => [{ id: bank, name: "Banco A", type: "bank" }, { id: office, name: "Ticketline", type: "ticket_office" }], account: () => async (id) => ({ id, company_id: company, is_active: true }) },
    reviewStore: store, ...over };
  return { d, store };
}
const post = (h: ReturnType<typeof createHandler>, body: unknown, jwt = "local-jwt-not-real") => h(new Request("http://local.invalid", { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("#333 fase12e handler", () => {
  it("bilheteira só da lista da empresa e do tipo bilheteira; banco escolhido como bilheteira recusado", async () => {
    const { d } = deps(); const h = createHandler(d);
    const t = await (await post(h, { action: "assistant_turn", text: "fecho ticketline", history: [] })).json();
    expect((await post(h, { action: "ticketline_preview", candidate_token: t.candidate_token, edits: { event_id: event, confirm_review: true, office_account_id: bank } })).status).toBe(403);
    const ok = await (await post(h, { action: "ticketline_preview", candidate_token: t.candidate_token, edits: { event_id: event, confirm_review: true, office_account_id: office } })).json();
    expect(ok.proposal.effects.office).toBe(office);
  });
  it("sem executor montado (Cloud hoje): execução e estado → 503, autorização diz indisponível", async () => {
    const { d } = deps(); const h = createHandler(d);
    const r = await post(h, { action: "ticketline_execute", authorization_id: authz, action_id: "a1" });
    expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/Nada foi executado/);
    expect((await post(h, { action: "ticketline_execution_status", authorization_id: authz })).status).toBe(503);
    const a = await (await post(h, { action: "ticketline_authorize", review_id: event, version: 1, effects_hash: "a".repeat(64), action_ids: ["a1"], replay_key: bank })).json();
    expect(a.executor).toBe("indisponível");
  });
  it("com executor: usa o JWT do pedido, não aceita efeitos no corpo, devolve links conferidos; incerto → 502", async () => {
    const seen: string[] = [];
    const executor: Executor = { probe: vi.fn(async (t) => { seen.push(t); }), status: vi.fn(async () => ({ authorization_id: authz, action_ids: ["a1"] as never, executions: [] })),
      execute: vi.fn(async (t, _a, action) => { seen.push(t); return { action_id: action, status: "succeeded" as const, replayed: false, result: { statement_id: event, number: "AP-77" } }; }) };
    const h = createHandler(deps({ executor }).d);
    const r = await (await post(h, { action: "ticketline_execute", authorization_id: authz, action_id: "a1" }, "jwt-pedro")).json();
    expect(seen).toEqual(["jwt-pedro", "jwt-pedro"]); expect(r.links[0]).toEqual({ label: "Apuramento AP-77", href: "/bilheteiras" });
    expect((await post(h, { action: "ticketline_execute", authorization_id: authz, action_id: "a1", effects: { total: 1 } })).status).toBe(400);
    expect((await post(h, { action: "ticketline_execute", authorization_id: authz, action_id: "a9" })).status).toBe(400);
    const unc = createHandler(deps({ executor: { ...executor, execute: async () => { throw new (await import("../../supabase/functions/_shared/assistant-executor")).ExecutionUncertain(); } } }).d);
    const u = await post(unc, { action: "ticketline_execute", authorization_id: authz, action_id: "a1" });
    expect(u.status).toBe(502); expect((await u.json()).uncertain).toBe(true);
  });
  it("fora do âmbito nominal ou assistente fechado → 503 antes do executor", async () => {
    const executor = { probe: vi.fn(), execute: vi.fn(), status: vi.fn() } as unknown as Executor;
    expect((await post(createHandler(deps({ executor, assistantScopeAllowed: () => false }).d), { action: "ticketline_execute", authorization_id: authz, action_id: "a1" })).status).toBe(503);
    expect((await post(createHandler(deps({ executor, assistantEnabled: false }).d), { action: "ticketline_execute", authorization_id: authz, action_id: "a1" })).status).toBe(503);
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

describe("#333 fase12e ecrã de execução", () => {
  const ctx = { user_id: user, company_id: company };
  const actions = [{ id: "a1", label: "Registar apuramento AP-77", depends_on: [] }, { id: "a2", label: "Confirmar apuramento", depends_on: ["a1"] }];
  it("indisponível: nenhum botão de execução nem resultado aparente", () => {
    render(<MemoryRouter><TicketlineExecutionPanel adapter={{} as DataEntryAdapter} context={ctx} authorizationId={authz} actions={actions} available={false} /></MemoryRouter>);
    expect(screen.getByText(/Execução indisponível neste ambiente/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByText(/Conferido/)).toBeNull();
  });
  it("resultado incerto bloqueia repetição e oferece só leitura; leitura mostra o conferido com link", async () => {
    const execute = vi.fn(async () => { throw Object.assign(new Error("Pedido indisponível"), { status: 503 }); });
    let reads = 0;
    const status = vi.fn(async () => ({ authorization_id: authz, action_ids: ["a1", "a2"], executions: reads++ === 0 ? [] : [{ action_id: "a1", status: "succeeded" as const, result: { lines: 2 }, links: [{ label: "Apuramento AP-77", href: "/bilheteiras" }] }] }));
    render(<MemoryRouter><TicketlineExecutionPanel adapter={{ ticketlineExecute: execute, ticketlineExecutionStatus: status } as unknown as DataEntryAdapter} context={ctx} authorizationId={authz} actions={actions} available /></MemoryRouter>);
    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    expect((screen.getAllByRole("button", { name: "Executar" })[1] as HTMLButtonElement).disabled).toBe(true); // a2 aguarda a1
    fireEvent.click(screen.getAllByRole("button", { name: "Executar" })[0]);
    const verify = await screen.findByRole("button", { name: "Verificar resultado" });
    expect(execute).toHaveBeenCalledTimes(1);
    fireEvent.click(verify);
    expect(await screen.findByText(/Conferido · 2 linha/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Apuramento AP-77" }).getAttribute("href")).toBe("/bilheteiras");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
