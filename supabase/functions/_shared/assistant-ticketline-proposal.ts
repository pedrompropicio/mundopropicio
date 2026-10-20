/**
 * #333 fase12 — proposta INERTE de lançamento de um fecho Ticketline recebido por email.
 * Não grava nada: descreve ações sobre os fluxos existentes (apuramento ticket_office_statements/lines,
 * confirm_ticket_office_statement, modal de fecho/ticket_office_settlements, transações e liquidações),
 * com dependências explícitas e hash dos efeitos para uma autorização futura vinculada.
 * Fecho recebido NÃO prova recebimento bancário: liquidação exige conta/data/valor confirmados por pessoa.
 */
export const LINE_TYPES = ["event_right", "ticketline_invoice", "venue_settlement", "advance", "carry_over"] as const;
export type LineType = typeof LINE_TYPES[number];
export const LINE_LABEL: Record<LineType, string> = {
  event_right: "Direito do evento", ticketline_invoice: "Fatura Ticketline", venue_settlement: "Acerto da sala",
  advance: "Repasse", carry_over: "Transitado",
};

/** Extração do email (dado NÃO confiável; valores em cêntimos inteiros). */
export type ExtractedStatement = {
  source_message_id: string;
  number: string | null;
  statement_date: string | null;
  document_total_cents: number | null;
  lines: { line_type: LineType; description: string; amount_cents: number; event_hint: string | null }[];
};
/** Contexto ERP lido no servidor para o user+empresa canónicos (nunca escolhido pelo modelo). */
export type ErpContext = {
  company_id: string;
  events: { id: string; name: string; date: string | null; sealed: boolean }[];
  existing_statements: { id: string; number: string; status: string }[];
};
/** Evidência de liquidação: só confirmação humana explícita; nunca inferida do email. */
export type SettlementEvidence = { financial_account_id: string; date: string; amount_cents: number; confirmed_by_user: true } | null;

export type Check = { code: string; ok: boolean; message: string };
export type ProposedAction = {
  id: string;
  kind: "create_statement" | "confirm_statement" | "settlement_in_modal" | "create_transactions" | "register_liquidation";
  label: string;
  existing_flow: string;
  depends_on: string[];
  blocked_reason: string | null;
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
};

const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve o evento SEM adivinhar: 0 ou >1 candidatos = pendência explícita. */
export function resolveEvent(hints: (string | null)[], events: ErpContext["events"], chosenId?: string | null) {
  if (chosenId) { const e = events.find((x) => x.id === chosenId); return e ? { match: e, candidates: [e] } : { match: null, candidates: [] }; }
  const h = [...new Set(hints.filter((x): x is string => !!x).map(norm).filter(Boolean))];
  const candidates = events.filter((e) => h.some((x) => { const n = norm(e.name); return n.includes(x) || x.includes(n); }));
  return { match: candidates.length === 1 ? candidates[0] : null, candidates };
}

export async function buildTicketlineProposal(x: ExtractedStatement, erp: ErpContext, opts: { event_id?: string | null; settlement?: SettlementEvidence }): Promise<Proposal> {
  const checks: Check[] = []; const needs: string[] = [];
  const totals: Partial<Record<LineType, number>> = {};
  for (const l of x.lines) totals[l.line_type] = (totals[l.line_type] ?? 0) + l.amount_cents;
  const sum = x.lines.reduce((a, l) => a + l.amount_cents, 0);
  const diff = x.document_total_cents == null ? null : sum - x.document_total_cents;
  const ints = x.lines.every((l) => Number.isInteger(l.amount_cents)) && (x.document_total_cents == null || Number.isInteger(x.document_total_cents));
  checks.push({ code: "cents", ok: ints, message: ints ? "Valores ao cêntimo." : "Valores com frações de cêntimo: rever o documento." });
  if (x.document_total_cents == null) { checks.push({ code: "total", ok: false, message: "Falta o total do documento." }); needs.push("Total do documento"); }
  else checks.push({ code: "sum", ok: diff === 0, message: diff === 0 ? "Σ linhas = total do documento." : `Σ linhas difere do total em ${(diff! / 100).toFixed(2)} €.` });
  if (!x.number) needs.push("Número do apuramento");
  const dup = x.number ? erp.existing_statements.find((s) => norm(s.number) === norm(x.number!)) : undefined;
  checks.push({ code: "duplicate", ok: !dup, message: dup ? `Apuramento ${dup.number} já existe (estado ${dup.status}); não duplicar.` : "Sem apuramento com o mesmo número." });
  const ev = resolveEvent(x.lines.map((l) => l.event_hint), erp.events, opts.event_id);
  if (!ev.match) needs.push(ev.candidates.length > 1 ? `Escolher o evento (${ev.candidates.length} possíveis)` : "Indicar o evento");
  const sealed = !!ev.match?.sealed;
  checks.push({ code: "sealed", ok: !sealed, message: sealed ? "Evento já tem fecho confirmado: não alterar." : "Evento sem fecho confirmado." });
  const settlement = opts.settlement ?? null;
  if (!settlement) needs.push("Conta, data e valor da liquidação (o email não prova o recebimento)");
  const payable = (totals.event_right ?? 0) + (totals.ticketline_invoice ?? 0) + (totals.venue_settlement ?? 0) + (totals.advance ?? 0) + (totals.carry_over ?? 0);
  if (settlement && settlement.amount_cents !== payable) checks.push({ code: "liquidation_amount", ok: false, message: `Valor confirmado (${(settlement.amount_cents / 100).toFixed(2)} €) ≠ saldo do apuramento (${(payable / 100).toFixed(2)} €).` });

  const hard = checks.some((c) => !c.ok);
  const base = hard || !ev.match || !x.number ? "Resolver verificações/pendências antes." : null;
  const actions: ProposedAction[] = [
    { id: "a1", kind: "create_statement", label: `Registar apuramento ${x.number ?? "?"} com ${x.lines.length} linha(s)`, existing_flow: "ticket_office_statements + ticket_office_statement_lines (Bilheteiras → Apuramentos)", depends_on: [], blocked_reason: base },
    { id: "a2", kind: "confirm_statement", label: "Confirmar apuramento (Σ linhas = total, sem linhas pendentes)", existing_flow: "RPC confirm_ticket_office_statement (admin/manager)", depends_on: ["a1"], blocked_reason: base },
    { id: "a3", kind: "settlement_in_modal", label: `Preparar fecho do evento ${ev.match?.name ?? "?"} no modal de fecho`, existing_flow: "TicketOfficeSettlementModal → ticket_office_settlements", depends_on: ["a2"], blocked_reason: base ?? (sealed ? "Evento selado." : null) },
    { id: "a4", kind: "create_transactions", label: "Gerar transações do fecho (direito, fatura Ticketline, acerto da sala)", existing_flow: "Fluxo de fecho existente (transações pendentes vinculadas)", depends_on: ["a3"], blocked_reason: base },
    { id: "a5", kind: "register_liquidation", label: "Liquidar com a entrada bancária confirmada", existing_flow: "transaction_payments (Registar pagamento)", depends_on: ["a4"], blocked_reason: settlement ? base : "Sem evidência de recebimento: conta/data/valor por confirmar." },
  ];
  const effects = { company: erp.company_id, source: x.source_message_id, number: x.number, date: x.statement_date, total: x.document_total_cents, lines: x.lines, event: ev.match?.id ?? null, settlement };
  return {
    version: 1, company_id: erp.company_id, source_message_id: x.source_message_id, statement_number: x.number,
    event: ev.match ? { id: ev.match.id, name: ev.match.name } : null, totals_cents: totals, sum_cents: sum,
    document_total_cents: x.document_total_cents, difference_cents: diff, checks, actions, needs,
    effects_hash: await sha256Hex(canon(effects)),
  };
}

/** Autorização futura: vinculada a user+empresa+versão+hash; qualquer variação da prévia a invalida. */
export type Authorization = { user_id: string; company_id: string; version: 1; effects_hash: string; action_ids: string[] };
export function authorizationMatches(a: Authorization, p: Proposal, ctx: { user_id: string; company_id: string }): boolean {
  return a.user_id === ctx.user_id && a.company_id === ctx.company_id && a.company_id === p.company_id
    && a.version === p.version && a.effects_hash === p.effects_hash
    && a.action_ids.every((id) => p.actions.some((x) => x.id === id && !x.blocked_reason));
}
/** Nesta entrega não há executor integrado: lacunas específicas, nunca execução fingida. */
export const EXECUTION_GAPS = [
  "Executor tipado ainda não ligado aos fluxos existentes (apuramento, fecho, transações, liquidações).",
  "Autorização expressa não é persistida nem verificada no servidor (tabela/RPC por aprovar).",
  "Fornecedor do modelo não ligado: o assistente corre só com respostas simuladas nos testes.",
] as const;
