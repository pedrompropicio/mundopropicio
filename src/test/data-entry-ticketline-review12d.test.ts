import { describe, it, expect, vi } from "vitest";
import { buildTicketlineProposal, authorizationMatches, compareWithCanonical, type ErpContext } from "../../supabase/functions/_shared/assistant-ticketline-proposal";
import { readAssistantAccounts, type ErpRead } from "../../supabase/functions/_shared/assistant-erp";
import { rpcReviewStore, REVIEW_SCHEMA, type ReviewStore } from "../../supabase/functions/_shared/assistant-review-store";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const user = "11111111-1111-4111-8111-111111111111", company = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const event = "44444444-4444-4444-8444-444444444444", account = "55555555-5555-4555-8555-555555555555";
const st = { source_message_id: "msg000001", number: "AP-77", statement_date: "2026-10-10", document_total_cents: 57950,
  lines: [{ line_type: "event_right" as const, description: "Direito", amount_cents: 100000, event_hint: "Duo Sintético" }, { line_type: "ticketline_invoice" as const, description: "Fatura", amount_cents: -12050, event_hint: null }, { line_type: "advance" as const, description: "Repasse", amount_cents: -30000, event_hint: null }] };
const open: ErpContext = { company_id: company, events: [{ id: event, name: "Duo Sintético", date: "2026-10-09", sealed: false }], existing_statements: [] };
const canonical = { status: "confirmed", settlement_date: "2026-10-12", net_transferred_cents: 50000, transfer_account_id: account };
const sealed: ErpContext = { ...open, events: [{ ...open.events[0], sealed: true, canonical }] };
const ev = (amount_cents: number, acc = account, date = "2026-10-15") => ({ financial_account_id: acc, date, amount_cents, confirmed_by_user: true as const, confirmed_by_user_id: user, server_validated: true });
const ctx = { user_id: user, company_id: company };
const auth = (p: { effects_hash: string }, action_ids: string[]) => ({ user_id: user, company_id: company, version: 1 as const, effects_hash: p.effects_hash, action_ids });

describe("#333 fase12d preparar vs liquidar", () => {
  it("sem revisão humana confirmada nada é autorizável", async () => {
    const p = await buildTicketlineProposal(st, open, {});
    expect(p.actions.every(a => a.blocked_reason)).toBe(true);
    expect(await authorizationMatches(auth(p, ["a1"]), p, ctx)).toBe(false);
  });
  it("revisão confirmada: subconjunto de preparação fechado por dependências; liquidação continua bloqueada", async () => {
    // fase12e: a bilheteira do apuramento passa a ser escolha humana obrigatória para preparar.
    const p = await buildTicketlineProposal(st, open, { human_reviewed: true, office_account_id: account });
    expect(p.actions.filter(a => !a.blocked_reason).map(a => a.id).sort()).toEqual(["a1", "a2", "a3", "a4"]);
    expect(p.actions.find(a => a.id === "a5")).toMatchObject({ stage: "liquidate", depends_on: ["a3"] });
    expect(await authorizationMatches(auth(p, ["a1"]), p, ctx)).toBe(true);
    expect(await authorizationMatches(auth(p, ["a1", "a2", "a4", "a3"]), p, ctx)).toBe(true);
    expect(await authorizationMatches(auth(p, ["a2"]), p, ctx)).toBe(false); // dependência omitida
    expect(await authorizationMatches(auth(p, ["a1", "a2", "a3"]), p, ctx)).toBe(false); // a3 sem a4
    expect(await authorizationMatches(auth(p, ["a1", "a2", "a3", "a4", "a5"]), p, ctx)).toBe(false); // a5 bloqueada
  });
  it("recebimento antes do fecho confirmado: depende do saldo canónico, não da soma do apuramento", async () => {
    const p = await buildTicketlineProposal(st, open, { human_reviewed: true, settlement: ev(57950) });
    expect(p.actions.find(a => a.id === "a5")?.blocked_reason).toMatch(/fecho confirmado/);
  });
  it("fecho canónico confirmado: liquidar só se conta, valor e data coincidem", async () => {
    const ok = await buildTicketlineProposal(st, sealed, { human_reviewed: true, settlement: ev(50000) });
    expect(ok.actions.filter(a => !a.blocked_reason).map(a => a.id)).toEqual(["a5"]);
    expect(ok.actions.find(a => a.id === "a5")?.depends_on).toEqual([]);
    expect(await authorizationMatches(auth(ok, ["a5"]), ok, ctx)).toBe(true);
    // Σ do apuramento (579,50 €) ≠ líquido transferido (500,00 €): valor da posição não liquida.
    const sum = await buildTicketlineProposal(st, sealed, { human_reviewed: true, settlement: ev(57950) });
    expect(sum.actions.find(a => a.id === "a5")?.blocked_reason).toMatch(/diverge/);
    expect(sum.needs.join(" ")).toMatch(/Pendente: Valor recebido difere do líquido transferido do fecho em 79,50/);
    expect(compareWithCanonical(ev(50000, other), canonical).diffs.join(" ")).toMatch(/conta indicada difere/);
    expect(compareWithCanonical(ev(50000, account, "2026-10-11"), canonical).diffs.join(" ")).toMatch(/anterior/);
    expect(compareWithCanonical(ev(50000), { ...canonical, transfer_account_id: null }).diffs.join(" ")).toMatch(/retido/);
    expect(compareWithCanonical(null, canonical).ok).toBe(false);
  });
  it("a5 sem dependência só vale quando o fecho canónico consta dos efeitos", async () => {
    const ok = await buildTicketlineProposal(st, sealed, { human_reviewed: true, settlement: ev(50000) });
    const forged = { ...ok, effects: { ...ok.effects, canonical: null } };
    expect(await authorizationMatches(auth(forged, ["a5"]), forged, ctx)).toBe(false);
  });
});

describe("#333 fase12d contas e persistência", () => {
  it("contas: só ativas e visíveis da empresa, por nome", async () => {
    const q: ErpRead[] = [];
    const rows = [{ id: account, company_id: company, name: "Banco B", is_active: true, is_hidden: false }, { id: other, company_id: company, name: "Oculta", is_active: true, is_hidden: true }, { id: event, company_id: company, name: "Banco A", is_active: true, is_hidden: null }];
    const r = await readAssistantAccounts(async x => { q.push(x); return rows; }, company, new AbortController().signal);
    expect(r.map(a => a.name)).toEqual(["Banco A", "Banco B"]); expect(q[0]).toMatchObject({ table: "financial_accounts", company, active: true });
    await expect(readAssistantAccounts(async () => [{ ...rows[0], company_id: other }], company, new AbortController().signal)).rejects.toThrow(/contexto/);
  });
  it("probe: esquema diferente, gate fechado ou função ausente → indisponível; actor/empresa do servidor", async () => {
    const calls: Record<string, unknown>[] = [];
    const mk = (probe: unknown, err?: string) => rpcReviewStore(async (_n, a) => { calls.push(a); return a.p_action === "probe" ? { data: probe, error: null } : err ? { data: null, error: { message: err } } : { data: { review_id: event, version: 1, effects_hash: "a".repeat(64) }, error: null }; });
    await expect(mk({ schema: "333-12c", enabled: true }).probe()).rejects.toThrow(/persistência/);
    await expect(mk({ schema: REVIEW_SCHEMA, enabled: false }).probe()).rejects.toThrow(/persistência/);
    await expect(rpcReviewStore(async () => ({ data: null, error: { code: "PGRST202", message: "not found" } })).probe()).rejects.toThrow(/persistência/);
    await expect(mk({ schema: REVIEW_SCHEMA, enabled: true }).probe()).resolves.toBeUndefined();
    await expect(mk(null, "#333: hash_mismatch").save({ user, company }, { review_id: null, expected_version: null, proposal: { effects_hash: "a".repeat(64) } as never })).rejects.toThrow(/inconsistente/);
    expect(calls.at(-1)).toMatchObject({ p_action: "save", p_actor: user, p_company: company });
  });
});

const BODY = "Fecho do evento Duo Sintético\nDireito 1000 euros, fatura 120,50 e repasse 300.\nTotal a transferir 579,50";
function deps(over: Partial<Deps> = {}) {
  const store: ReviewStore = { probe: vi.fn(async () => {}), save: vi.fn(async (_s, i) => ({ review_id: event, version: 1, effects_hash: i.proposal.effects_hash })), authorize: vi.fn(async () => ({ authorization_id: other, replayed: false, status: "authorized_inert" as const })) };
  const reader = { search: vi.fn(async () => ({ messages: [{ message_id: "msg000001", from: "fechos@exemplo.invalid", subject: "Fecho", date: "2026-10-10", attachments: [] }], next_page_token: null })),
    read: vi.fn(async (id: string) => ({ message_id: id, from: "fechos@exemplo.invalid", subject: "Fecho", date: "2026-10-10", kind: "plain" as const, body_text: BODY, truncated: false })),
    attachment: vi.fn(), attachments: vi.fn(async () => [{ part_id: "1", filename: "fecho-AP-77.pdf", mime: "application/pdf", size_bytes: 2048, attachment_id: "secret-id" }]) };
  const steps = [{ type: "tool", name: "gmail_search", args: { from_date: "2026-10-01", to_date: "2026-10-19", sender: "exemplo.invalid", page_size: 10 } },
    { type: "tool", name: "gmail_read", args: { message_id: "msg000001" } },
    { type: "tool", name: "prepare_ticketline_proposal", args: { message_id: "msg000001", statement: { number: "AP-77", statement_date: "2026-10-10", document_total_cents: 57950, lines: st.lines } } }];
  let i = 0;
  const d: Deps = { uploadEnabled: false, cors: {}, continuationSecret: "s".repeat(40), today: () => "2026-10-20", assistantEnabled: true,
    getUser: async (t) => ({ id: t === "jwt-other" ? other : user }),
    userRpc: async () => ({ data: { role: "manager", company_id: company }, error: null }), recordReceipt: vi.fn(), storage: { upload: vi.fn(), download: vi.fn() },
    gmail: { reader: async () => reader } as never,
    assistant: { model: { next: async () => ({ step: steps[i++] as never, tokens: 10 }) }, erpContext: async () => open },
    ticketlineErp: { context: async () => open, accounts: async () => [{ id: account, name: "Banco A" }], account: () => async (id) => ({ id, company_id: company, is_active: true }) },
    reviewStore: store, ...over };
  return { d, store, reader };
}
const post = (h: ReturnType<typeof createHandler>, body: unknown, jwt = "local-jwt-not-real") => h(new Request("http://local.invalid", { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("#333 fase12d handler", () => {
  it("conversa livre: a IA extrai do corpo lido no servidor e entrega um candidato assinado para revisão", async () => {
    const { d, store } = deps(); const h = createHandler(d);
    const t = await (await post(h, { action: "assistant_turn", text: "Chegou o fecho da Ticketline; prepara os lançamentos.", history: [] })).json();
    expect(t.status).toBe("proposal"); expect(t.candidate_state).toBeUndefined();
    expect(t.candidate.lines).toHaveLength(3); expect(t.candidate.sources[0]).toMatchObject({ source: "model", message_id: "msg000001" });
    expect(t.candidate.incomplete.join(" ")).toMatch(/Extraído pela IA/);
    const draft = await (await post(h, { action: "ticketline_preview", candidate_token: t.candidate_token, edits: { event_id: event } })).json();
    expect(draft.proposal.actions.every((a: { blocked_reason: string | null }) => a.blocked_reason)).toBe(true);
    const r = await (await post(h, { action: "ticketline_preview", candidate_token: t.candidate_token, edits: { event_id: event, confirm_review: true }, save: { review_id: null, expected_version: null } })).json();
    expect(r.persisted).toBe(true); expect(r.proposal.effects.human_reviewed).toBe(true); expect(r.events[0].id).toBe(event);
    expect(store.probe).toHaveBeenCalled(); expect((store.save as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ user, company });
    const a = await post(h, { action: "ticketline_authorize", review_id: event, version: 1, effects_hash: r.proposal.effects_hash, action_ids: ["a1", "a2"], replay_key: account });
    expect(a.status).toBe(200); expect((await a.json()).executor).toBe("indisponível");
    expect((store.authorize as ReturnType<typeof vi.fn>).mock.calls[0][1].action_ids).toEqual(["a1", "a2"]);
    expect(d.storage.upload).not.toHaveBeenCalled();
  });
  it("anexos e contas: metadados legíveis sem identificadores internos; anexo fora da lista recusado", async () => {
    const { d } = deps(); const h = createHandler(d);
    const l = await (await post(h, { action: "ticketline_attachments", message_id: "msg000001" })).json();
    expect(l.attachments).toEqual([{ part_id: "1", filename: "fecho-AP-77.pdf", mime: "application/pdf", size_bytes: 2048 }]);
    expect((await (await post(h, { action: "ticketline_accounts" })).json()).accounts).toEqual([{ id: account, name: "Banco A" }]);
    expect((await post(h, { action: "ticketline_candidate", message_id: "msg000001", part_id: "9" })).status).toBe(409);
  });
  it("gates: assistente fechado ou fora do âmbito → 503; persistência ausente/sonda falhada → 503 sem memória", async () => {
    expect((await post(createHandler(deps({ assistantEnabled: false }).d), { action: "ticketline_accounts" })).status).toBe(503);
    expect((await post(createHandler(deps({ assistantScopeAllowed: () => false }).d), { action: "ticketline_attachments", message_id: "msg000001" })).status).toBe(503);
    const { d, store } = deps(); (store.probe as ReturnType<typeof vi.fn>).mockRejectedValue(new (await import("../../supabase/functions/_shared/assistant-review-store")).ReviewUnavailable());
    const h = createHandler(d);
    const t = await (await post(h, { action: "assistant_turn", text: "fecho ticketline", history: [] })).json();
    const s = await post(h, { action: "ticketline_preview", candidate_token: t.candidate_token, edits: { confirm_review: true }, save: { review_id: null, expected_version: null } });
    expect(s.status).toBe(503); expect(store.save).not.toHaveBeenCalled();
  });
});
