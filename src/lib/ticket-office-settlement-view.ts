/**
 * Leitura de um fecho de bilheteira (só leitura) — dados partilhados entre o
 * diálogo "Ver fecho" e o PDF. Os números vêm da base (ticket_office_settlements);
 * o valor de cada dedução usa a MESMA fórmula do modal de fecho
 * (amount × (1 + iva/100), ao cêntimo). D-ERP232: mostra o DIREITO do evento,
 * nunca desconta adiantamentos.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { loadTicketOfficeStatements, type TicketOfficeStatementsRead } from "@/hooks/useTicketOfficeStatements";
import { parseTicketlineStatementAmountCents } from "@/lib/ticketline-statement-contract";

export interface SettlementEventRight {
  statementId: string;
  statementNumber: string;
  href: string;
  quotaLineId: string;
  amount: number;
  gross: number;
  retained: number;
  deductions: { id: string; description: string; amount: number }[];
  documentPage: number | null;
  documentLineRef: string | null;
}

/** Project only the unique confirmed quota read/validated by R5, never a draft
 * or a subsequent Q4 adjustment. Reconcile displayed cents before rendering. */
export function settlementEventRight(read: TicketOfficeStatementsRead | undefined, s: {
  company_id?: string; financial_account_id?: string; event_id?: string;
}): SettlementEventRight | undefined {
  if (read?.status !== "v2") return;
  const member = read.provenance.eventMemberships.find(m => m.event_id === s.event_id
    && m.company_id === s.company_id && m.financial_account_id === s.financial_account_id);
  if (!member) return;
  const statement = read.confirmedStatements.find(p => p.id === member.statement_id);
  const quota = statement?.ticket_office_statement_lines.find(l => l.id === member.quota_line_id);
  if (!statement || statement.status !== "confirmed" || !quota || quota.event_id !== s.event_id
    || quota.document_line_type !== "event_sales") throw new Error("Pertença sem quota documental confirmada");
  const cents = parseTicketlineStatementAmountCents;
  const gross = cents(quota.event_gross_amount), retained = cents(quota.event_retained_amount);
  const amount = cents(quota.declared_event_net);
  const deductions = statement.ticket_office_statement_lines.filter(l => l.quota_line_id === quota.id).map(l => ({
    id: l.id, description: l.description ?? "Dedução documental", amount: cents(l.amount) / 100,
  }));
  const deductionCents = statement.ticket_office_statement_lines.filter(l => l.quota_line_id === quota.id)
    .reduce((sum, l) => sum + BigInt(cents(l.amount)), 0n);
  if (BigInt(gross) - BigInt(retained) !== BigInt(cents(quota.amount))
    || BigInt(amount) !== BigInt(cents(quota.amount)) + deductionCents) throw new Error("Quota documental não reconciliada");
  return { statementId: statement.id, statementNumber: String(statement.number),
    href: `/bilheteiras?conta=${encodeURIComponent(member.financial_account_id)}&separador=apuramentos#apuramento-${encodeURIComponent(statement.id)}`,
    quotaLineId: quota.id, amount: amount / 100, gross: gross / 100, retained: retained / 100, deductions,
    documentPage: quota.document_page, documentLineRef: quota.document_line_ref };
}

export interface SettlementDeduction {
  id: string;
  description: string;
  supplier: string | null;
  value: number;
}

export interface SettlementStatementDocument {
  id: string;
  fileName: string;
  source: string;
  filePath: string;
}

export interface SettlementView {
  eventRight?: SettlementEventRight;
  id: string;
  status: string;
  eventName: string;
  eventDate: string | null;
  settlementDate: string | null;
  officeName: string;
  statementNumber: string | null;
  /** Documentos do APURAMENTO ligado (não o document_url do fecho). Vazio sem apuramento. */
  statementDocuments: SettlementStatementDocument[];
  grossRevenue: number;
  totalDeductions: number;
  netFinal: number;
  netTransferred: number;
  deductions: SettlementDeduction[];
  venueRetainedAmount: number;
  venueRetainedNotes: string | null;
  venueRemainderPaid: boolean;
  venueRemainderAmount: number;
  formaManual: string | null;
  formaManualNotes: string | null;
  notes: string | null;
  adjustmentNotes: string | null;
  grossAdjustmentNotes: string | null;
  closedByName: string | null;
  closedAt: string | null;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;
export const deductionGross = (amount: number, ivaRate: number) =>
  roundCents(Number(amount || 0) * (1 + Number(ivaRate || 0) / 100));

export function settlementPdfFileName(eventName: string, settlementDate: string | null): string {
  const slug =
    (eventName || "evento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "evento";
  return `fecho-${slug}-${(settlementDate || "").slice(0, 10) || "sem-data"}.pdf`;
}

export function buildSettlementView(
  s: any,
  officeName: string,
  extras: { deductions: SettlementDeduction[]; statementNumber: string | null; closedByName: string | null; statementDocuments?: SettlementStatementDocument[]; eventRight?: SettlementEventRight },
): SettlementView {
  return {
    id: s.id,
    status: s.status,
    eventName: s.events?.name ?? "—",
    eventDate: s.events?.date ?? null,
    settlementDate: s.settlement_date ?? (s.created_at ? String(s.created_at).slice(0, 10) : null),
    officeName,
    statementNumber: extras.statementNumber,
    statementDocuments: s.statement_id || extras.eventRight ? extras.statementDocuments ?? [] : [],
    grossRevenue: Number(s.gross_revenue || 0),
    totalDeductions: Number(s.total_deductions || 0),
    netFinal: extras.eventRight?.amount ?? Number(s.net_adjusted ?? s.net_calculated ?? 0),
    netTransferred: Number(s.net_transferred || 0),
    deductions: extras.deductions,
    venueRetainedAmount: Number(s.venue_retained_amount || 0),
    venueRetainedNotes: s.venue_retained_notes ?? null,
    venueRemainderPaid: !!s.venue_invoice_remainder_paid,
    venueRemainderAmount: Number(s.venue_invoice_remainder_amount || 0),
    formaManual: s.forma_liquidacao_manual ?? null,
    formaManualNotes: s.forma_liquidacao_manual_notes ?? null,
    notes: s.notes ?? null,
    adjustmentNotes: s.adjustment_notes ?? null,
    grossAdjustmentNotes: s.gross_adjustment_notes ?? null,
    closedByName: extras.closedByName,
    closedAt: s.closed_at ?? null,
    ...(extras.eventRight ? { eventRight: extras.eventRight } : {}),
  };
}

export async function fetchSettlementView(s: any, officeName: string, read?: TicketOfficeStatementsRead): Promise<SettlementView> {
  const statementRead = read ?? (s.company_id && s.financial_account_id
    ? await loadTicketOfficeStatements(s.financial_account_id, { companyId: s.company_id }) : undefined);
  if (statementRead?.status === "v2_unavailable") throw new Error(statementRead.message);
  const eventRight = settlementEventRight(statementRead, s);
  const statementId = eventRight?.statementId ?? s.statement_id;
  const [txRes, stRes, prRes] = await Promise.all([
    fetchAllPagedQuery(
      (supabase as any)
        .from("transactions")
        .select("id, description, amount, iva_rate, suppliers:suppliers!transactions_supplier_id_fkey(name)")
        .eq("settlement_id", s.id)
        .order("description"),
    ),
    statementId
      ? (supabase as any).from("ticket_office_statements")
          .select("number, ticket_office_statement_documents!ticket_office_statement_documents_statement_id_fkey(id, file_name, file_path, document_source, created_at)")
          .eq("id", statementId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    s.closed_by
      ? (supabase as any).from("profiles").select("full_name, email").eq("id", s.closed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const deductions: SettlementDeduction[] = ((txRes as any)?.data || []).map((t: any) => ({
    id: t.id,
    description: t.description ?? "—",
    supplier: t.suppliers?.name ?? null,
    value: deductionGross(t.amount, t.iva_rate),
  }));
  const pr = (prRes as any)?.data;
  const statementDocuments: SettlementStatementDocument[] = [...((stRes as any)?.data?.ticket_office_statement_documents ?? [])]
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((d: any) => ({ id: d.id, fileName: d.file_name, source: d.document_source, filePath: d.file_path }));
  return buildSettlementView(s, officeName, {
    deductions,
    statementNumber: eventRight?.statementNumber ?? ((stRes as any)?.data?.number != null ? String((stRes as any).data.number) : null),
    closedByName: pr ? pr.full_name || pr.email || null : null,
    statementDocuments,
    eventRight,
  });
}

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  confirmed: "Confirmado",
  reversed: "Estornado",
};
