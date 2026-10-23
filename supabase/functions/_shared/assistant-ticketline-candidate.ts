/**
 * #333 fase12c — candidato Ticketline tipado a partir de (a) anexo escolhido lido pelo scanner existente
 * e/ou (b) corpo do email lido nesta sessão. Tudo é CANDIDATO com proveniência; nada é confirmado.
 * Revisão humana substitui campos com proveniência "human"; qualquer edição gera novo hash/versão.
 * Liquidação: só confirmação humana autenticada + conta validada no servidor para a empresa canónica.
 */
import type { AnalysisWire } from "./data-entry-analysis.ts";
import { normalizeScannerDate } from "./scanner-analysis.ts";
import { LINE_TYPES, type LineType, type ExtractedStatement, type SettlementEvidence } from "./assistant-ticketline-proposal.ts";

export const CANDIDATE_LIMITS = { attachmentBytes: 20 * 1024 * 1024, bodyChars: 4000, lines: 40, description: 160 } as const;

export type Provenance =
  | { source: "email_body"; message_id: string; body_sha256: string; line: number; truncated: boolean }
  | { source: "attachment"; origin: string; sha256: string; size_bytes: number; mime: string }
  | { source: "model"; message_id: string; body_sha256: string }
  | { source: "human"; user_id: string };
export type Field<T> = { value: T; prov: Provenance } | null;
export type CandidateLine = { line_type: LineType; description: string; amount_cents: number; event_hint: string | null; prov: Provenance };
/** Pendência BLOQUEANTE estruturada: enquanto existir, a confirmação da revisão não produz ações
 * executáveis. A mensagem entra também em `incomplete` (uma só fonte de texto). Avisos
 * informativos ("conferir no original") NÃO são bloqueantes. */
export type BlockingIssue = { code: string; message: string };
export const BLOCKING = {
  body_truncated: "body_truncated", no_lines: "no_lines", unknown_lines: "unknown_lines",
  bad_amounts: "bad_amounts", coverage_truncated: "coverage_truncated", description_truncated: "description_truncated",
  field_conflict: "field_conflict", lines_conflict: "lines_conflict", sum_mismatch: "sum_mismatch",
  total_unrecognized: "total_unrecognized", date_ambiguous: "date_ambiguous",
  currency_missing: "currency_missing", currency_non_eur: "currency_non_eur", extraction_unavailable: "extraction_unavailable",
} as const;
export type TicketlineCandidate = {
  message_id: string;
  number: Field<string>; date: Field<string>; total_cents: Field<number>;
  lines: CandidateLine[];
  event_id: Field<string>;
  sources: Provenance[];
  /** Pendências explícitas: truncagem, conflitos, linhas não reconhecidas, falta de dados. */
  incomplete: string[];
  /** Subconjunto bloqueante de `incomplete`, com código estável para resolução humana explícita. */
  blocking: BlockingIssue[];
};
/** Regista pendência bloqueante sem duplicar (código+mensagem). */
export function pushBlocking(c: TicketlineCandidate, code: string, message: string): void {
  if (!c.incomplete.includes(message)) c.incomplete.push(message);
  if (!c.blocking.some(b => b.code === code && b.message === message)) c.blocking.push({ code, message });
}
/** Σ linhas = total do documento no candidato EFETIVO (pós-fusão/edição); senão mensagem de bloqueio. */
export function candidateSumMessage(c: Pick<TicketlineCandidate, "lines" | "total_cents">): string | null {
  if (c.total_cents === null || !c.lines.length) return null;
  const sum = c.lines.reduce((a, l) => a + l.amount_cents, 0);
  return sum === c.total_cents.value ? null : `Σ linhas difere do total do documento em ${((sum - c.total_cents.value) / 100).toFixed(2).replace(".", ",")} €: rever linha a linha antes de confirmar.`;
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const d = await crypto.subtle.digest("SHA-256", new Uint8Array(b).buffer);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/** "1.234,56" | "-1 234,56" | "1234.56" → cêntimos inteiros; ambíguo → null. */
export function parseEuroCents(raw: string): number | null {
  const s = raw.replace(/[€\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  let m = s.match(/^(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  if (m) return Number(`${m[1]}${m[2].replace(/\./g, "")}${m[3]}`) + 0;
  m = s.match(/^(-?)(\d+)\.(\d{2})$/);
  if (m) return Number(`${m[1]}${m[2]}${m[3]}`);
  return null;
}
const LABELS: [RegExp, LineType][] = [
  [/^direito(s)?( do evento)?\b/, "event_right"], [/^fatura ticketline\b|^comiss(ao|oes) ticketline\b/, "ticketline_invoice"],
  [/^acerto( da)? sala\b/, "venue_settlement"], [/^repasse(s)?\b|^adiantamento(s)?\b/, "advance"], [/^transitado\b/, "carry_over"],
];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Parser determinístico do corpo; não interpreta instruções e não adivinha tipos desconhecidos. */
export async function candidateFromBody(read: { message_id: string; text: string; truncated: boolean }): Promise<TicketlineCandidate> {
  const text = read.text.slice(0, CANDIDATE_LIMITS.bodyChars);
  const body_sha256 = await sha256Hex(text);
  const prov = (line: number): Provenance => ({ source: "email_body", message_id: read.message_id, body_sha256, line, truncated: read.truncated });
  const c: TicketlineCandidate = { message_id: read.message_id, number: null, date: null, total_cents: null, lines: [], event_id: null, sources: [prov(0)], incomplete: [], blocking: [] };
  if (read.truncated || read.text.length > CANDIDATE_LIMITS.bodyChars) pushBlocking(c, BLOCKING.body_truncated, "Corpo do email truncado: confirmar linhas e total no documento original.");
  let unknown = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line) return;
    const f = fold(line);
    const num = f.match(/^apuramento\s*(?:n[.ºo°]*\s*)?[:#]?\s*([a-z0-9][a-z0-9\-/ ]{0,40})$/);
    if (num) { c.number ??= { value: line.slice(line.length - num[1].length).trim(), prov: prov(i + 1) }; return; }
    const dt = f.match(/^data\s*[:\-]\s*(.+)$/);
    if (dt) { const v = normalizeScannerDate(dt[1]); if (v) c.date ??= { value: v, prov: prov(i + 1) }; else pushBlocking(c, BLOCKING.date_ambiguous, `Data ambígua na linha ${i + 1}.`); return; }
    const money = line.match(/^(.{2,160}?)\s*[:\-–]\s*(\(?-?[\d.\s]+[,.]\d{2}\)?)\s*€?$/);
    if (!money) return;
    const cents = parseEuroCents(money[2]);
    if (cents === null) { unknown++; return; }
    const label = fold(money[1]);
    if (/^total\b/.test(label)) { if (c.total_cents && c.total_cents.value !== cents) pushBlocking(c, BLOCKING.field_conflict, "Dois totais diferentes no corpo."); c.total_cents ??= { value: cents, prov: prov(i + 1) }; return; }
    const type = LABELS.find(([r]) => r.test(label))?.[1];
    if (!type) { unknown++; return; }
    if (c.lines.length >= CANDIDATE_LIMITS.lines) { pushBlocking(c, BLOCKING.coverage_truncated, `Mais de ${CANDIDATE_LIMITS.lines} linhas: cobertura incompleta.`); return; }
    const hint = money[1].match(/[-–]\s*(.+)$/)?.[1]?.trim() ?? null;
    c.lines.push({ line_type: type, description: money[1].trim().slice(0, CANDIDATE_LIMITS.description), amount_cents: cents, event_hint: hint, prov: prov(i + 1) });
  });
  if (unknown) pushBlocking(c, BLOCKING.unknown_lines, `${unknown} linha(s) com valor não reconhecidas: rever manualmente.`);
  if (!c.lines.length) pushBlocking(c, BLOCKING.no_lines, "Sem linhas reconhecidas: introduzir as linhas na revisão.");
  return c;
}

/** Extração conduzida pela IA sobre o corpo lido no servidor: candidato completo, nunca confirmado. */
export async function candidateFromModel(read: { message_id: string; text: string; truncated: boolean }, st: Omit<ExtractedStatement, "source_message_id" | "source_content_hash">): Promise<TicketlineCandidate> {
  const body_sha256 = await sha256Hex(read.text.slice(0, CANDIDATE_LIMITS.bodyChars));
  const prov: Provenance = { source: "model", message_id: read.message_id, body_sha256 };
  const lines = st.lines.slice(0, CANDIDATE_LIMITS.lines).map(l => ({ ...l, description: l.description.slice(0, CANDIDATE_LIMITS.description), prov }));
  const c: TicketlineCandidate = { message_id: read.message_id, number: st.number ? { value: st.number, prov } : null, date: st.statement_date ? { value: st.statement_date, prov } : null,
    total_cents: st.document_total_cents == null ? null : { value: st.document_total_cents, prov }, event_id: null, lines, sources: [prov],
    incomplete: ["Extraído pela IA a partir do email: confirma cada campo e linha antes de guardar."], blocking: [] };
  if (read.truncated) pushBlocking(c, BLOCKING.body_truncated, "Corpo do email truncado: confirmar linhas e total no documento original.");
  if (st.lines.length > CANDIDATE_LIMITS.lines) pushBlocking(c, BLOCKING.coverage_truncated, `Mais de ${CANDIDATE_LIMITS.lines} linhas: cobertura incompleta.`);
  return c;
}

/** Anexo escolhido: tem de pertencer à mensagem lida no servidor; hash/tamanho calculados aqui. */
export async function verifyAttachmentSource(x: { message_id: string; part_id: string; bytes: Uint8Array; mime: string; listed: { part_id: string; size_bytes: number }[]; expected_sha256?: string }) {
  if (!x.listed.some(a => a.part_id === x.part_id)) throw new Error("Anexo não pertence à mensagem escolhida.");
  if (x.bytes.length === 0 || x.bytes.length > CANDIDATE_LIMITS.attachmentBytes) throw new Error("Anexo vazio ou acima do limite de 20 MB.");
  const sha256 = await sha256Hex(x.bytes);
  if (x.expected_sha256 && x.expected_sha256 !== sha256) throw new Error("Hash do anexo divergente; repete a escolha.");
  return { source: "attachment" as const, origin: `gmail:${x.message_id}:${x.part_id}`, sha256, size_bytes: x.bytes.length, mime: x.mime };
}

/** Funde campos do scanner existente (número/data/total) no candidato; conflito → campo vazio + pendência. */
export function mergeScanner(c: TicketlineCandidate, wire: AnalysisWire, prov: Extract<Provenance, { source: "attachment" }>): TicketlineCandidate {
  const out: TicketlineCandidate = { ...c, sources: [...c.sources, prov], incomplete: [...c.incomplete], blocking: [...(c.blocking ?? [])] };
  const get = (k: string) => wire.fields.find(f => f.field === k)?.value ?? null;
  const merge = <T>(key: "number" | "date" | "total_cents", v: T | null, label: string) => {
    if (v === null) return;
    const cur = out[key] as Field<T>;
    if (cur && cur.value !== v) { (out as Record<string, unknown>)[key] = null; pushBlocking(out, BLOCKING.field_conflict, `${label} difere entre o anexo e o corpo do email: indicar na revisão.`); return; }
    if (!cur) (out as Record<string, unknown>)[key] = { value: v, prov };
  };
  merge("number", get("invoice_number"), "Número");
  merge("date", get("invoice_date"), "Data");
  const total = get("total_amount"); merge("total_cents", total === null ? null : parseEuroCents(Number(total).toFixed(2)), "Total");
  // #333 fase12k: o scanner existente só devolve número/data/total; nunca linhas. Dizê-lo em vez de sugerir que as procurou.
  if (!out.lines.length) {
    out.incomplete = out.incomplete.filter(x => !x.startsWith("Sem linhas reconhecidas"));
    out.blocking = out.blocking.filter(b => b.code !== BLOCKING.no_lines);
    pushBlocking(out, BLOCKING.no_lines, "Revisão parcial: o scanner lê só número, data e total do anexo e não extrai as linhas do apuramento — introduzir as linhas a partir do documento original.");
  }
  if (!out.date) pushBlocking(out, BLOCKING.date_ambiguous, "Data não lida no anexo (ausente ou formato ambíguo): fica vazia; preencher a partir do documento.");
  if ([out.number, out.total_cents].some(f => f?.prov.source === "attachment")) out.incomplete.push("Número e total lidos pelo scanner: conferir no documento original antes de confirmar.");
  return out;
}

export const reviewEditsSchemaShape = ["number", "date", "total_cents", "event_id", "lines", "resolve_blocking"] as const;
export type ReviewEdits = Partial<{ confirm_review: boolean; number: string | null; date: string | null; total_cents: number | null; event_id: string | null; lines: Omit<CandidateLine, "prov">[]; resolve_blocking: string[] }>;

/** Edição humana autenticada: user_id vem da sessão no servidor, nunca do corpo do pedido.
 * Pendências bloqueantes: as recomputáveis (sem linhas, soma) são reavaliadas sobre o candidato
 * editado; as restantes só caem com resolução humana EXPLÍCITA por código (`resolve_blocking`).
 * Nenhuma pendência é removida por regex de mensagem. */
export function applyHumanEdits(c: TicketlineCandidate, edits: ReviewEdits, user_id: string): TicketlineCandidate {
  const prov: Provenance = { source: "human", user_id };
  const out: TicketlineCandidate = structuredClone(c);
  out.blocking = out.blocking ?? [];
  const set = <K extends "number" | "date" | "total_cents" | "event_id">(k: K, v: unknown) => { (out as Record<string, unknown>)[k] = v === null ? null : { value: v, prov }; };
  if ("number" in edits) set("number", edits.number?.trim() || null);
  if ("date" in edits) { if (edits.date && !/^\d{4}-\d{2}-\d{2}$/.test(edits.date)) throw new Error("Data inválida."); set("date", edits.date ?? null); }
  if ("total_cents" in edits) { if (edits.total_cents != null && !Number.isSafeInteger(edits.total_cents)) throw new Error("Total inválido."); set("total_cents", edits.total_cents ?? null); }
  if ("event_id" in edits) set("event_id", edits.event_id ?? null);
  if (edits.lines) {
    if (edits.lines.length > CANDIDATE_LIMITS.lines) throw new Error("Demasiadas linhas.");
    out.lines = edits.lines.map(l => {
      if (!LINE_TYPES.includes(l.line_type) || !Number.isSafeInteger(l.amount_cents)) throw new Error("Linha inválida.");
      return { line_type: l.line_type, description: String(l.description ?? "").trim().slice(0, CANDIDATE_LIMITS.description), amount_cents: l.amount_cents, event_hint: l.event_hint ?? null, prov };
    });
  }
  // Resolução de bloqueios: códigos desconhecidos são ignorados (nunca resolvem nada).
  const resolved = new Set((edits.resolve_blocking ?? []).filter(code => out.blocking.some(b => b.code === code)));
  const keep = out.blocking.filter(b => {
    if (b.code === BLOCKING.no_lines) return out.lines.length === 0; // recomputado
    if (b.code === BLOCKING.sum_mismatch) return candidateSumMessage(out) !== null; // recomputado
    return !resolved.has(b.code); // restantes: só resolução explícita
  });
  const dropped = out.blocking.filter(b => !keep.includes(b));
  out.blocking = keep;
  if (dropped.length) out.incomplete = out.incomplete.filter(m => !dropped.some(b => b.message === m));
  // Soma do candidato editado: se deixou de fechar (ou passou a divergir), bloqueia de novo.
  const sumIssue = candidateSumMessage(out);
  if (sumIssue && !out.blocking.some(b => b.code === BLOCKING.sum_mismatch)) pushBlocking(out, BLOCKING.sum_mismatch, sumIssue);
  return out;
}

/** Candidato → entrada da proposta. A proveniência entra nos efeitos (hash) para ligar fonte e revisão. */
export async function candidateToStatement(c: TicketlineCandidate): Promise<ExtractedStatement & { provenance_hash: string }> {
  const provenance_hash = await sha256Hex(JSON.stringify({ sources: c.sources, number: c.number?.prov ?? null, date: c.date?.prov ?? null, total: c.total_cents?.prov ?? null, lines: c.lines.map(l => l.prov), incomplete: c.incomplete, blocking: (c.blocking ?? []).map(b => b.code) }));
  return {
    source_message_id: c.message_id, source_content_hash: provenance_hash, provenance_hash,
    number: c.number?.value ?? null, statement_date: c.date?.value ?? null, document_total_cents: c.total_cents?.value ?? null,
    lines: c.lines.map(({ line_type, description, amount_cents, event_hint }) => ({ line_type, description, amount_cents, event_hint })),
  };
}

/** Confirmação de recebimento: pedido humano explícito + conta da empresa canónica, ativa; data não futura. */
export type AccountReader = (account_id: string) => Promise<{ id: string; company_id: string; is_active: boolean; is_hidden?: boolean } | null>;
export async function validateSettlementConfirmation(
  input: { financial_account_id: string; date: string; amount_cents: number; confirm: true } | undefined,
  ctx: { user_id: string; company_id: string; today: string; origin: "human_request" | "model" },
  readAccount: AccountReader,
): Promise<SettlementEvidence> {
  if (!input) return null;
  if (ctx.origin !== "human_request" || input.confirm !== true) throw new Error("Recebimento só por confirmação humana autenticada.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > ctx.today) throw new Error("Data de recebimento inválida ou futura.");
  if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error("Valor de recebimento inválido.");
  const acc = await readAccount(input.financial_account_id);
  if (!acc || acc.company_id !== ctx.company_id || !acc.is_active || acc.is_hidden) throw new Error("Conta indisponível para esta empresa.");
  return { financial_account_id: acc.id, date: input.date, amount_cents: input.amount_cents, confirmed_by_user: true, confirmed_by_user_id: ctx.user_id, server_validated: true };
}
