/**
 * #333 fase12 — proposta INERTE de lançamento de um fecho Ticketline recebido por email.
 * Não grava nada: descreve ações sobre os fluxos existentes (apuramento ticket_office_statements/lines,
 * confirm_ticket_office_statement, modal de fecho/ticket_office_settlements, transações e liquidações),
 * com dependências explícitas e hash dos efeitos para uma autorização futura vinculada.
 * Fecho recebido NÃO prova recebimento bancário: liquidação exige conta/data/valor confirmados por pessoa.
 */
import { statementTypeTotals } from "./ticketline-totals.ts";
export const LINE_TYPES = ["event_right", "ticketline_invoice", "venue_settlement", "advance", "carry_over"] as const;
export type LineType = typeof LINE_TYPES[number];
export const LINE_LABEL: Record<LineType, string> = {
  event_right: "Direito do evento", ticketline_invoice: "Fatura Ticketline", venue_settlement: "Acerto da sala",
  advance: "Repasse", carry_over: "Transitado",
};

/** Extração do email (dado NÃO confiável; valores em cêntimos inteiros). */
export type ExtractedStatement = {
  source_message_id: string;
  source_content_hash?: string;
  number: string | null;
  statement_date: string | null;
  document_total_cents: number | null;
  lines: { line_type: LineType; description: string; amount_cents: number; event_hint: string | null }[];
};
/** Contexto ERP lido no servidor para o user+empresa canónicos (nunca escolhido pelo modelo). */
export type ErpContext = {
  company_id: string;
  events: { id: string; name: string; date: string | null; sealed: boolean; canonical?: CanonicalSettlement | null }[];
  existing_statements: { id: string; number: string; status: string }[];
};
/** Fecho confirmado no modal canónico (ticket_office_settlements), lido com o JWT do chamador. Fonte do valor a receber. */
export type CanonicalSettlement = { status: string; settlement_date: string; net_transferred_cents: number; transfer_account_id: string | null };
/** Evidência de liquidação: só confirmação humana explícita; nunca inferida do email. */
export type SettlementEvidence = { financial_account_id: string; date: string; amount_cents: number; confirmed_by_user: true; confirmed_by_user_id?: string; server_validated?: boolean } | null;

export type Check = { code: string; ok: boolean; message: string };
export type ProposedAction = {
  id: string;
  kind: "create_statement" | "confirm_statement" | "settlement_in_modal" | "create_transactions" | "register_liquidation";
  label: string;
  existing_flow: string;
  depends_on: string[];
  blocked_reason: string | null;
  /** Preparar/apurar (a1–a4) é distinto de liquidar (a5). */
  stage: "prepare" | "liquidate";
};
export type Proposal = {
  version: 1;
  company_id: string;
  source_message_id: string;
  statement_number: string | null;
  event: { id: string; name: string } | null;
  totals_cents: Partial<Record<LineType, number>>;
  sum_cents: number;
  document_total_cents: number | null;
  difference_cents: number | null;
  checks: Check[];
  actions: ProposedAction[];
  needs: string[];
  effects_hash: string;
  /** Complete source candidates included in the binding, never confirmed by the model. */
  effects: Record<string, unknown>;
};

const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const proposalEffectsHash = (effects: Record<string, unknown>, actions: ProposedAction[]) => sha256Hex(canon({ effects, actions }));
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve o evento SEM adivinhar: 0 ou >1 candidatos = pendência explícita. */
export function resolveEvent(hints: (string | null)[], events: ErpContext["events"], chosenId?: string | null) {
  if (chosenId) { const e = events.find((x) => x.id === chosenId); return e ? { match: e, candidates: [e] } : { match: null, candidates: [] }; }
  const h = [...new Set(hints.filter((x): x is string => !!x).map(norm).filter(Boolean))];
  const candidates = events.filter((e) => h.some((x) => { const n = norm(e.name); return n.includes(x) || x.includes(n); }));
  return { match: candidates.length === 1 ? candidates[0] : null, candidates };
}

/** Confere o recebimento confirmado pela pessoa contra o fecho canónico (net_transferred → conta de transferência), nunca contra Σ do apuramento. */
export function compareWithCanonical(s: SettlementEvidence, c: CanonicalSettlement | null | undefined): { ok: boolean; diffs: string[] } {
  if (!s || !s.server_validated) return { ok: false, diffs: ["Recebimento não confirmado por si (conta, data e valor)."] };
  if (!c || c.status !== "confirmed") return { ok: false, diffs: ["Fecho ainda não confirmado no modal: não há saldo canónico a receber."] };
  const diffs: string[] = [];
  if (!c.transfer_account_id) diffs.push("O fecho não regista transferência: o líquido ficou retido na bilheteira.");
  else if (c.transfer_account_id !== s.financial_account_id) diffs.push("A conta indicada difere da conta de transferência do fecho.");
  if (c.net_transferred_cents !== s.amount_cents) diffs.push(`Valor recebido difere do líquido transferido do fecho em ${((s.amount_cents - c.net_transferred_cents) / 100).toFixed(2)} €.`);
  if (s.date < c.settlement_date) diffs.push("Data do recebimento anterior à data do fecho.");
  return { ok: diffs.length === 0, diffs };
}

export async function buildTicketlineProposal(x: ExtractedStatement, erp: ErpContext, opts: { event_id?: string | null; settlement?: SettlementEvidence; human_reviewed?: boolean }): Promise<Proposal> {
  const checks: Check[] = []; const needs: string[] = [];
  const mapped = statementTypeTotals(x.lines.map(l => ({ line_type: l.line_type, amount: l.amount_cents / 100 })));
  const totals = Object.fromEntries(Object.entries(mapped).map(([type, amount]) => [type, Math.round(amount * 100)])) as Partial<Record<LineType, number>>;
  const sum = x.lines.reduce((a, l) => a + l.amount_cents, 0);
  const diff = x.document_total_cents == null ? null : sum - x.document_total_cents;
  const ints = x.lines.length > 0 && x.lines.every((l) => Number.isSafeInteger(l.amount_cents) && Math.abs(l.amount_cents) <= 1000000000 && LINE_TYPES.includes(l.line_type)) && (x.document_total_cents == null || Number.isSafeInteger(x.document_total_cents));
  checks.push({ code: "cents", ok: ints, message: ints ? "Valores ao cêntimo." : "Sem linhas ou valores com frações de cêntimo: rever o documento." });
  if (x.document_total_cents == null) { checks.push({ code: "total", ok: false, message: "Falta o total do documento." }); needs.push("Total do documento"); }
  else checks.push({ code: "sum", ok: diff === 0, message: diff === 0 ? "Σ linhas = total do documento." : `Σ linhas difere do total em ${((diff ?? 0) / 100).toFixed(2)} €.` });
  if (!x.number) needs.push("Número do apuramento");
  const number = x.number;
  const dup = number ? erp.existing_statements.find((s) => s.number.trim().toUpperCase() === number.trim().toUpperCase()) : undefined;
  checks.push({ code: "duplicate", ok: !dup, message: dup ? `Apuramento ${dup.number} já existe (estado ${dup.status}); não duplicar.` : "Sem apuramento com o mesmo número." });
  const ev = resolveEvent(x.lines.map((l) => l.event_hint), erp.events, opts.event_id);
  if (!ev.match) needs.push(ev.candidates.length > 1 ? `Escolher o evento (${ev.candidates.length} possíveis)` : "Indicar o evento");
  const sealed = !!ev.match?.sealed;
  checks.push({ code: "sealed", ok: true, message: sealed ? "Evento já tem fecho confirmado: só a liquidação pode ser avaliada." : "Evento sem fecho confirmado." });
  if (!opts.human_reviewed) needs.push("Confirmar a revisão dos campos e linhas (o candidato da IA/email não é aceite sozinho).");
  const settlement = opts.settlement ?? null;
  const canonical = compareWithCanonical(settlement, ev.match?.canonical);
  if (!settlement) needs.push("Conta, data e valor do recebimento, verificados por si no banco (o email não prova o recebimento).");
  else if (!canonical.ok) needs.push(...canonical.diffs.map(d => `Pendente: ${d}`));
  checks.push({ code: "liquidation_amount", ok: canonical.ok || !settlement, message: !settlement ? "Liquidação não pedida nesta revisão." : canonical.ok ? "Recebimento coincide com o fecho canónico (conta, valor, data)." : "Recebimento diverge do fecho canónico: fica pendente." });
  needs.push("Repasses/transitado entram só na posição; o direito do evento é calculado no modal canónico.");

  const hard = checks.some((c) => !c.ok && c.code !== "liquidation_amount");
  const prep = hard ? "Resolver verificações antes." : !ev.match ? "Escolher o evento." : !x.number ? "Indicar o número do apuramento."
    : sealed ? "Evento já fechado: preparação não se repete." : !opts.human_reviewed ? "Falta a sua confirmação da revisão." : null;
  const liq = !settlement ? "Sem recebimento confirmado por si." : !opts.human_reviewed ? "Falta a sua confirmação da revisão." : hard ? "Resolver verificações antes."
    : !sealed ? "Depende do fecho confirmado no modal (saldo canónico)." : canonical.ok ? null : "Recebimento diverge do fecho canónico.";
  const actions: ProposedAction[] = [
    { id: "a1", stage: "prepare", kind: "create_statement", label: `Registar apuramento ${x.number ?? "?"} com ${x.lines.length} linha(s)`, existing_flow: "ticket_office_statements + ticket_office_statement_lines (Bilheteiras → Apuramentos)", depends_on: [], blocked_reason: prep },
    { id: "a2", stage: "prepare", kind: "confirm_statement", label: "Confirmar apuramento (Σ linhas = total, sem linhas pendentes)", existing_flow: "RPC confirm_ticket_office_statement (admin/manager)", depends_on: ["a1"], blocked_reason: prep },
    { id: "a4", stage: "prepare", kind: "create_transactions", label: "Rever transações existentes e documentos em falta antes do fecho", existing_flow: "Fluxos documentais existentes → despesas pendentes vinculadas no modal (não cria despesas automaticamente)", depends_on: ["a2"], blocked_reason: prep },
    { id: "a3", stage: "prepare", kind: "settlement_in_modal", label: `Preparar fecho do evento ${ev.match?.name ?? "?"} no modal de fecho`, existing_flow: "TicketOfficeSettlementModal → ticket_office_settlements", depends_on: ["a4"], blocked_reason: prep },
    { id: "a5", stage: "liquidate", kind: "register_liquidation", label: "Liquidar com a entrada bancária confirmada", existing_flow: "transaction_payments (Registar pagamento)", depends_on: sealed ? [] : ["a3"], blocked_reason: liq },
  ];
  const effects = { company: erp.company_id, source: x.source_message_id, source_content_hash: x.source_content_hash ?? null, number: x.number, date: x.statement_date, total: x.document_total_cents, lines: x.lines, event: ev.match?.id ?? null,
    human_reviewed: !!opts.human_reviewed, canonical: ev.match?.canonical ?? null,
    settlement: settlement?.server_validated ? { account: settlement.financial_account_id, date: settlement.date, amount_cents: settlement.amount_cents, by: settlement.confirmed_by_user_id ?? null } : null };
  return {
    version: 1, company_id: erp.company_id, source_message_id: x.source_message_id, statement_number: x.number,
    event: ev.match ? { id: ev.match.id, name: ev.match.name } : null, totals_cents: totals, sum_cents: sum,
    document_total_cents: x.document_total_cents, difference_cents: diff, checks, actions, needs,
    effects, effects_hash: await proposalEffectsHash(effects, actions),
  };
}

/** Autorização: user+empresa+versão+hash e um SUBCONJUNTO explícito de ações desbloqueadas, fechado por dependências. */
export type Authorization = { user_id: string; company_id: string; version: 1; effects_hash: string; action_ids: string[] };
const EXPECTED: Record<string, { kind: ProposedAction["kind"]; deps: string[][] }> = {
  a1: { kind: "create_statement", deps: [[]] }, a2: { kind: "confirm_statement", deps: [["a1"]] },
  a3: { kind: "settlement_in_modal", deps: [["a4"]] }, a4: { kind: "create_transactions", deps: [["a2"]] }, a5: { kind: "register_liquidation", deps: [["a3"], []] },
};
export async function authorizationMatches(a: Authorization, p: Proposal, ctx: { user_id: string; company_id: string }): Promise<boolean> {
  if (!a.action_ids.length || new Set(a.action_ids).size !== a.action_ids.length || new Set(p.actions.map(x => x.id)).size !== p.actions.length || p.actions.length !== 5) return false;
  if (p.actions.some(x => !EXPECTED[x.id] || x.kind !== EXPECTED[x.id].kind || !EXPECTED[x.id].deps.some(d => canon(d) === canon(x.depends_on)))) return false;
  const a5 = p.actions.find(x => x.id === "a5")!;
  if (a5.depends_on.length === 0 && !(p.effects as { canonical?: { status?: string } | null }).canonical?.status) return false;
  if (p.effects_hash !== await proposalEffectsHash(p.effects, p.actions)) return false;
  const selected = new Set(a.action_ids);
  return a.user_id === ctx.user_id && a.company_id === ctx.company_id && a.company_id === p.company_id
    && a.version === p.version && a.effects_hash === p.effects_hash
    && a.action_ids.every((id) => p.actions.some((x) => x.id === id && !x.blocked_reason && x.depends_on.every(dep => selected.has(dep))));
}
/** Nesta entrega não há executor integrado: lacunas específicas, nunca execução fingida. */
export const EXECUTION_GAPS = [
  "Executor tipado ainda não ligado aos fluxos existentes (apuramento, fecho, transações, liquidações).",
  "Persistência da revisão/autorização preparada (RPC revista), mas o esquema não está aplicado nem o gate aberto.",
  "Adaptador de IA implementado, ativação fechada e disponibilidade real ainda não validada.",
] as const;
