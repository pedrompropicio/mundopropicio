/**
 * Leitura de um fecho de bilheteira (só leitura) — dados partilhados entre o
 * diálogo "Ver fecho" e o PDF. Os números vêm da base (ticket_office_settlements);
 * o valor de cada dedução usa a MESMA fórmula do modal de fecho
 * (amount × (1 + iva/100), ao cêntimo). D-ERP232: mostra o DIREITO do evento,
 * nunca desconta adiantamentos.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

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
  extras: { deductions: SettlementDeduction[]; statementNumber: string | null; closedByName: string | null; statementDocuments?: SettlementStatementDocument[] },
): SettlementView {
  return {
    id: s.id,
    status: s.status,
    eventName: s.events?.name ?? "—",
    eventDate: s.events?.date ?? null,
    settlementDate: s.settlement_date ?? (s.created_at ? String(s.created_at).slice(0, 10) : null),
    officeName,
    statementNumber: extras.statementNumber,
    statementDocuments: s.statement_id ? extras.statementDocuments ?? [] : [],
    grossRevenue: Number(s.gross_revenue || 0),
    totalDeductions: Number(s.total_deductions || 0),
    netFinal: Number(s.net_adjusted ?? s.net_calculated ?? 0),
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
  };
}

export async function fetchSettlementView(s: any, officeName: string): Promise<SettlementView> {
  const [txRes, stRes, prRes] = await Promise.all([
    fetchAllPagedQuery(
      (supabase as any)
        .from("transactions")
        .select("id, description, amount, iva_rate, suppliers:suppliers!transactions_supplier_id_fkey(name)")
        .eq("settlement_id", s.id)
        .order("description"),
    ),
    s.statement_id
      ? (supabase as any).from("ticket_office_statements")
          .select("number, ticket_office_statement_documents!ticket_office_statement_documents_statement_id_fkey(id, file_name, file_path, document_source, created_at)")
          .eq("id", s.statement_id)
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
    statementNumber: (stRes as any)?.data?.number != null ? String((stRes as any).data.number) : null,
    closedByName: pr ? pr.full_name || pr.email || null : null,
    statementDocuments,
  });
}

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  confirmed: "Confirmado",
  reversed: "Estornado",
};
