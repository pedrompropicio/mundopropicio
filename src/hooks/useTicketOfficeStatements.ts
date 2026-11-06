import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import {
  isTicketOfficeStatementsV2Enabled, parseTicketlineStatementAmountCents,
  TICKET_OFFICE_STATEMENTS_V2_FEATURE, TICKETLINE_STATEMENT_LINE_TYPES,
} from "@/lib/ticketline-statement-contract";
import type { RetainedStatement } from "@/lib/ticket-office-balance";
import type { TicketOfficeStatementProvenance, TicketOfficeV2Provenance } from "@/lib/ticket-office-position";

interface ReadResult { data: unknown; error: unknown }
interface ReadQuery extends PromiseLike<ReadResult> {
  eq(column: string, value: unknown): ReadQuery;
  in(column: string, values: string[]): ReadQuery;
  order(column: string, options?: { ascending: boolean }): ReadQuery;
  range(from: number, to: number): ReadQuery;
  maybeSingle(): ReadQuery;
}
// IO boundary only. All v2 responses are parsed below; this client has no write API.
export interface TicketOfficeStatementsReadClient {
  from(table: string): { select(columns: string): ReadQuery };
  rpc(name: string): PromiseLike<ReadResult>;
}
const text = z.string().min(1);
const instant = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const money = z.union([z.number(), z.string()]).refine((value) => {
  try { parseTicketlineStatementAmountCents(value); return true; } catch { return false; }
}, "Invalid documentary cents");
const cutoffSource = z.enum(["company_day_end", "pdf_explicit"]);
const lineSchema = z.object({
  id: text, statement_id: text, company_id: text,
  line_type: text, position: z.number().int().nonnegative(), description: z.string().nullable(),
  amount: money.nullable(), event_id: text.nullable(), document_line_type: z.enum(TICKETLINE_STATEMENT_LINE_TYPES).nullable(),
  source_sha256: sha256.nullable(), document_page: z.number().int().positive().nullable(), document_line_ref: text.nullable(),
  opening_note: text.nullable(), opening_created_by: text.nullable(), opening_created_at: instant.nullable(),
  adjusts_statement_id: text.nullable(), adjusts_line_id: text.nullable(), adjustment_reason: text.nullable(),
}).passthrough();
const headerSchema = z.object({
  id: text, company_id: text, financial_account_id: text, number: z.union([text, z.number()]),
  statement_date: text, document_total: money.nullable(), status: z.enum(["draft", "confirmed"]),
  contract_version: z.union([z.literal(1), z.literal(2)]), revision: z.number().int().positive(),
  position_cutoff_at: instant.nullable(), position_timezone: text.nullable(), position_cutoff_source: cutoffSource.nullable(),
  predecessor_statement_id: text.nullable(), primary_document_id: text.nullable(), primary_document_sha256: sha256.nullable(),
  confirmation_receipt: z.record(z.unknown()).nullable(), opening_balance_line_id: text.nullable(),
}).passthrough();
const membershipSchema = z.object({
  event_id: text, statement_id: text, quota_line_id: text, company_id: text,
  financial_account_id: text, created_by: text, created_at: instant,
});
const openingSchema = z.object({
  line_id: text, amount: money, note: text, prepared_by: text, prepared_at: instant,
  approved_by: text, approved_at: instant,
});
const receiptSchema = z.object({
  contract_version: z.literal(2), statement_id: text, revision: z.number().int().positive(),
  calculated_total: money, independent_position: money, sources: z.array(z.record(z.unknown())),
  confirmed_by: text, confirmed_at: instant, opening_approved: z.boolean(), opening: openingSchema.nullable(),
  lines: z.array(lineSchema), documents: z.array(z.record(z.unknown())),
  position_proof: z.object({
    validator: z.literal("issue303-r4-v1"), contract_version: z.literal(2), statement_id: text,
    revision: z.number().int().positive(), position_cutoff_at: instant, position_timezone: text,
    position_cutoff_source: cutoffSource, primary_document_sha256: sha256, independent_position: money,
    sources: z.array(z.record(z.unknown())),
  }).passthrough(),
}).passthrough();
// This app disables strictNullChecks; Zod's inferred object keys otherwise become
// optional even though parse() above requires their presence at runtime.
type Header = Required<z.infer<typeof headerSchema>>;
type StatementLine = Required<z.infer<typeof lineSchema>>;
export type TicketOfficeStatementV2 = Header & {
  contract_version: 2;
  ticket_office_statement_lines: StatementLine[];
  provenance: TicketOfficeStatementProvenance;
};
export type TicketOfficeStatementsRead =
  | { status: "legacy"; statements: RetainedStatement[] }
  | { status: "v2"; statements: TicketOfficeStatementV2[]; confirmedStatements: TicketOfficeStatementV2[];
      draftStatements: TicketOfficeStatementV2[]; legacyStatements: RetainedStatement[]; provenance: TicketOfficeV2Provenance }
  | { status: "v2_unavailable"; message: "capacidade v2 indisponível"; cause: unknown };

const legacySelect = "id, number, statement_date, document_total, status, ticket_office_statement_lines!ticket_office_statement_lines_statement_id_fkey(id, line_type, position, description, amount, event_id)";
const headerSelect = "id, company_id, financial_account_id, number, statement_date, document_total, status, contract_version, revision, position_cutoff_at, position_timezone, position_cutoff_source, predecessor_statement_id, primary_document_id, primary_document_sha256, confirmation_receipt, opening_balance_line_id";
const lineSelect = "id, statement_id, company_id, line_type, position, description, amount, event_id, document_line_type, source_sha256, document_page, document_line_ref, opening_note, opening_created_by, opening_created_at, adjusts_statement_id, adjusts_line_id, adjustment_reason, transaction_id, invoice_group_id, previous_statement_id, ticket_office_settlement_id, quota_line_id, declared_event_net, event_gross_amount, event_retained_amount, pending_document, notes";
const membershipSelect = "event_id, statement_id, quota_line_id, company_id, financial_account_id, created_by, created_at";
function requireRead(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Contrato de leitura v2 inválido: ${detail}`);
}
function missingCapability(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return ["42703", "42883", "42P01", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "");
}
/** Total unique ordering, no embedded-line truncation and no partial results at the safety bound. */
async function pages(query: ReadQuery): Promise<unknown[]> {
  const result: unknown[] = [];
  for (let start = 0; start < 50000; start += 1000) {
    const { data, error } = await query.range(start, start + 999);
    if (error) throw error;
    requireRead(Array.isArray(data), "resposta paginada ausente");
    result.push(...data);
    if (data.length < 1000) return result;
  }
  throw new Error("Leitura v2 incompleta: limite de paginação atingido");
}
function projectStatement(header: Header, liveLines: StatementLine[]): TicketOfficeStatementV2 {
  let lines = liveLines;
  const receipt = header.status === "confirmed" ? receiptSchema.parse(header.confirmation_receipt) : null;
  if (receipt) {
    const proof = receipt.position_proof;
    requireRead(receipt.statement_id === header.id && receipt.revision === header.revision
      && proof.statement_id === header.id && proof.revision === header.revision
      && Number(receipt.calculated_total) === Number(header.document_total)
      && Number(receipt.independent_position) === Number(header.document_total)
      && Number(proof.independent_position) === Number(header.document_total)
      && proof.primary_document_sha256 === header.primary_document_sha256
      && proof.position_timezone === header.position_timezone && proof.position_cutoff_source === header.position_cutoff_source
      && Date.parse(proof.position_cutoff_at) === Date.parse(header.position_cutoff_at ?? ""), "recibo/corte não corresponde ao cabeçalho");
    requireRead(header.document_total !== null && header.primary_document_id && header.primary_document_sha256, "confirmado sem documento/total");
    // Frozen receipt lines are the source of confirmed provenance, including Q2/Q4.
    lines = receipt.lines as StatementLine[];
  }
  const ids = new Set<string>();
  for (const line of lines) {
    requireRead(line.statement_id === header.id && line.company_id === header.company_id && !ids.has(line.id)
      && line.document_line_type !== null, "linha fora do documento, repetida ou sem tipo v2");
    ids.add(line.id);
  }
  const openingLines = lines.filter((l) => l.document_line_type === "opening_balance");
  requireRead(openingLines.length <= 1, "abertura repetida");
  const opening = openingLines[0];
  if (opening) requireRead(opening.amount !== null && opening.opening_note && opening.opening_created_by && opening.opening_created_at, "origem da abertura em falta");
  if (receipt) {
    requireRead(receipt.opening_approved === !!opening && (receipt.opening?.line_id ?? null) === (opening?.id ?? null)
      && header.opening_balance_line_id === (opening?.id ?? null), "aprovação da abertura em falta");
    if (opening && receipt.opening) requireRead(receipt.opening.note === opening.opening_note
      && receipt.opening.prepared_by === opening.opening_created_by && receipt.opening.prepared_at === opening.opening_created_at
      && Number(receipt.opening.amount) === Number(opening.amount)
      && receipt.opening.approved_by === receipt.confirmed_by && receipt.opening.approved_at === receipt.confirmed_at, "origem da abertura diverge do recibo");
  }
  const provenance: TicketOfficeStatementProvenance = {
    statementId: header.id, status: header.status, documentTotal: header.document_total === null ? null : Number(header.document_total), revision: header.revision,
    cutoff: header.position_cutoff_at && header.position_timezone && header.position_cutoff_source
      ? { at: header.position_cutoff_at, timezone: header.position_timezone, source: header.position_cutoff_source } : null,
    primaryDocument: header.primary_document_id && header.primary_document_sha256
      ? { id: header.primary_document_id, sha256: header.primary_document_sha256 } : null,
    receipt: receipt ? { source: "server_confirmation_receipt", value: header.confirmation_receipt! } : null,
    opening: opening ? {
      lineId: opening.id, amount: Number(opening.amount), note: opening.opening_note!,
      preparedBy: opening.opening_created_by!, preparedAt: opening.opening_created_at!,
      approval: receipt?.opening ? { approvedBy: receipt.opening.approved_by, approvedAt: receipt.opening.approved_at } : null,
    } : null,
    adjustments: lines.filter((l) => l.adjusts_statement_id !== null || l.adjusts_line_id !== null).map((line) => {
      requireRead(line.adjusts_statement_id && line.adjusts_line_id && line.adjustment_reason, "origem Q4 em falta");
      return { lineId: line.id, originalStatementId: line.adjusts_statement_id, originalLineId: line.adjusts_line_id,
        reason: line.adjustment_reason, eventId: line.event_id, sourceSha256: line.source_sha256,
        documentPage: line.document_page, documentLineRef: line.document_line_ref };
    }),
  };
  return { ...header, contract_version: 2, ticket_office_statement_lines: lines, provenance };
}

/** One read adapter, caller JWT only. A known enabled account never falls back to v1. */
export async function loadTicketOfficeStatements(
  officeId: string, options: { companyId?: string; client?: TicketOfficeStatementsReadClient } = {},
): Promise<TicketOfficeStatementsRead> {
  const db: TicketOfficeStatementsReadClient = options.client ?? supabase as unknown as TicketOfficeStatementsReadClient;
  let companyId = options.companyId;
  if (!companyId) {
    const resolved = await db.rpc("current_company_id");
    if (resolved.error) throw resolved.error;
    requireRead(typeof resolved.data === "string" && resolved.data.length > 0, "empresa de sessão ausente");
    companyId = resolved.data;
  }
  const feature = await db.from("company_features").select("feature_key, enabled, config")
    .eq("company_id", companyId).eq("feature_key", TICKET_OFFICE_STATEMENTS_V2_FEATURE).maybeSingle();
  // An unreadable configuration cannot establish that an account is disabled.
  if (feature.error) throw feature.error;
  const featureConfig = (feature.data as { config?: unknown } | null)?.config;
  if (!isTicketOfficeStatementsV2Enabled({ feature: feature.data, config: featureConfig, financialAccountId: officeId })) {
    const legacy = await db.from("ticket_office_statements").select(legacySelect)
      .eq("financial_account_id", officeId).order("statement_date", { ascending: false });
    if (legacy.error) throw legacy.error;
    return { status: "legacy", statements: (legacy.data ?? []) as RetainedStatement[] };
  }
  try {
    const headers = z.array(headerSchema).parse(await pages(db.from("ticket_office_statements").select(headerSelect)
      .eq("company_id", companyId).eq("financial_account_id", officeId)
      .order("statement_date", { ascending: false }).order("id", { ascending: true }))) as Header[];
    const [members, lineRows] = await Promise.all([
      pages(db.from("ticket_office_statement_events").select(membershipSelect)
        .eq("company_id", companyId).eq("financial_account_id", officeId).order("event_id", { ascending: true })),
      // Bound IN URLs; each group's lines are independently paginated.
      (async () => {
        const all: unknown[] = [];
        // Even an empty account probes the canonical line columns (empty IN).
        for (let start = 0; start < Math.max(headers.length, 1); start += 100) all.push(...await pages(
          db.from("ticket_office_statement_lines").select(lineSelect).eq("company_id", companyId)
            .in("statement_id", headers.slice(start, start + 100).map((h) => h.id)).order("id", { ascending: true })));
        return all;
      })(),
    ]);
    const memberships = z.array(membershipSchema).parse(members) as TicketOfficeV2Provenance["eventMemberships"];
    const lines = z.array(lineSchema).parse(lineRows) as StatementLine[];
    const headersById = new Map(headers.map((h) => [h.id, h]));
    const linesByStatement = new Map<string, StatementLine[]>();
    requireRead(headersById.size === headers.length, "cabeçalho repetido");
    for (const h of headers) requireRead(h.company_id === companyId && h.financial_account_id === officeId, "conta/empresa cruzada");
    for (const line of lines) {
      requireRead(line.company_id === companyId && headersById.has(line.statement_id), "linha sem cabeçalho da conta");
      if (!linesByStatement.has(line.statement_id)) linesByStatement.set(line.statement_id, []);
      linesByStatement.get(line.statement_id)!.push(line);
    }
    const legacyStatements: RetainedStatement[] = [];
    const v2: TicketOfficeStatementV2[] = [];
    for (const h of headers) {
      const detail = linesByStatement.get(h.id) ?? [];
      if (h.contract_version === 1) legacyStatements.push({ ...h, ticket_office_statement_lines: detail });
      else v2.push(projectStatement(h, detail));
    }
    const documentLines = [...legacyStatements, ...v2].flatMap((s) => s.ticket_office_statement_lines ?? []);
    const quotaLines = new Map(documentLines.map((l) => [l.id, l]));
    requireRead(quotaLines.size === documentLines.length, "identidade de linha repetida");
    const membershipsByEvent = new Map(memberships.map((m) => [m.event_id, m]));
    const seenEvents = new Set<string>();
    for (const member of memberships) {
      const parent = headersById.get(member.statement_id);
      const quota = quotaLines.get(member.quota_line_id) as StatementLine | undefined;
      requireRead(member.company_id === companyId && member.financial_account_id === officeId
        && parent?.status === "confirmed" && !seenEvents.has(member.event_id)
        && quota?.statement_id === parent.id && quota.event_id === member.event_id
        && (parent.contract_version === 1 ? quota.line_type === "event_right" : quota.document_line_type === "event_sales"), "pertença não é única ou não corresponde à quota confirmada");
      seenEvents.add(member.event_id);
    }
    for (const statement of v2.filter((s) => s.status === "confirmed")) {
      for (const line of statement.ticket_office_statement_lines.filter((l) => l.document_line_type === "event_sales")) {
        const member = membershipsByEvent.get(line.event_id);
        requireRead(member?.statement_id === statement.id && member.quota_line_id === line.id, "quota confirmada sem pertença");
      }
    }
    const confirmedStatements = v2.filter((s) => s.status === "confirmed")
      .sort((a, b) => Date.parse(b.position_cutoff_at!) - Date.parse(a.position_cutoff_at!) || a.id.localeCompare(b.id));
    const provenance: TicketOfficeV2Provenance = { contractVersion: 2, financialAccountId: officeId,
      latestConfirmedStatementId: confirmedStatements[0]?.id ?? null,
      statements: v2.map((s) => s.provenance), eventMemberships: memberships };
    return { status: "v2", statements: confirmedStatements, confirmedStatements,
      draftStatements: v2.filter((s) => s.status === "draft"), legacyStatements, provenance };
  } catch (cause) {
    if (missingCapability(cause)) return { status: "v2_unavailable", message: "capacidade v2 indisponível", cause };
    throw cause;
  }
}

export function useTicketOfficeStatements(officeId: string | null, enabled = true) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ticket-office-statements", companyId, user?.id, officeId],
    enabled: enabled && !!companyId && !!user && !!officeId,
    queryFn: () => loadTicketOfficeStatements(officeId!, { companyId: companyId! }),
    staleTime: 0, retry: false,
  });
}
