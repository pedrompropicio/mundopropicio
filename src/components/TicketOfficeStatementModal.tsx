import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPaged, fetchAllPagedQuery } from "@/lib/supabase-paging";
import type { TicketOfficeStatementsRead, TicketOfficeStatementV2 } from "@/hooks/useTicketOfficeStatements";
import { parseTicketlineStatementAmountCents, TICKETLINE_STATEMENT_LINE_TYPES, type TicketlineStatementLineType } from "@/lib/ticketline-statement-contract";
import { loadStatementDocuments, statementDraftDocuments, statementDocumentLabels, type StatementDocument } from "@/lib/ticket-office-statement-documents";
import { TicketOfficeStatementDocuments } from "@/components/TicketOfficeStatementDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/mock-data";

export const statementDraftLabels = {
  title: "Rascunho do apuramento", description: "Preparar o documento e guardar rascunho.",
  number: "Número", date: "Data do documento", total: "Total do documento (cêntimos)", notes: "Notas",
  cutoff: "Corte previsto (exclusivo)", timezone: "Fuso da empresa", unknownTimezone: "Fuso da empresa indisponível",
  cutoffHelp: "Previsão: 00:00 do dia seguinte no fuso da empresa. Uma hora explícita no PDF prevalece. O servidor decide e valida o corte.",
  lines: "Linhas do documento", add: "Adicionar linha", remove: "Remover linha", type: "Tipo de linha",
  candidates: "Eventos candidatos", chooseEvent: "Selecionar evento", loading: "A carregar fontes…",
  sourceError: "Não foi possível carregar as fontes. Volte a abrir o rascunho para tentar novamente.",
  amount: "Valor (cêntimos)", descriptionLine: "Descrição", gross: "Bruto (cêntimos)", retained: "Retido pela sala (cêntimos)",
  declared: "Quota declarada (cêntimos)", pending: "Por documentar", transaction: "Transação de origem (ID)",
  invoiceGroup: "Grupo de fatura (ID)", event: "Evento", accountOnly: "Movimento da conta", quota: "Quota do evento",
  sourceTransaction: "Selecionar lançamento existente", noTransaction: "Selecionar lançamento",
  noQuota: "Sem quota", previous: "Predecessor confirmado", openingNote: "Nota obrigatória da abertura",
  openingHelp: "Abertura manual única da conta. A autoria e a data são registadas pelo servidor; a aprovação explícita do admin pertence à confirmação.",
  reference: "Referência no PDF", page: "Página no PDF", source: "Prova de origem", noSource: "Sem prova verificada",
  positiveEvidence: "Justificação do sinal positivo", reason: "Motivo documental",
  save: "Gravar rascunho", saving: "A gravar…", cancel: "Fechar", required: "Indique número, data e total do documento.",
  invalidCents: "Use cêntimos inteiros dentro do intervalo permitido, sem arredondamento.",
  invalidLine: "Preencha as fontes, os valores e a nota obrigatória de cada linha.",
  invalidOpening: "A abertura só é permitida no primeiro documento da conta.",
  conflict: "O rascunho foi alterado por outra pessoa. Os dados foram recarregados; reabra o documento para rever e gravar a nova revisão.",
  failed: "Não foi possível gravar o rascunho.", missingRevision: "O servidor não devolveu uma revisão válida do rascunho.",
  incomplete: "Leitura de fontes incompleta.",
  sum: "Soma das linhas (cêntimos)", difference: "Diferença para o documento (cêntimos)",
  review: "Conferir e confirmar", confirm: "Confirmar", confirming: "A confirmar…", confirmTitle: "Confirmar apuramento",
  confirmHelp: "Confira as linhas e o documento. A confirmação é final e será validada pelo servidor.",
  explicitConfirmation: "Confirmar definitivamente este apuramento?", back: "Continuar a conferir",
  approveOpening: "Aprovo explicitamente o saldo de abertura e a sua nota.",
  openingPending: "Abertura por aprovar por admin", openingApproved: "Abertura aprovada por admin",
  confirmConflict: "A revisão mudou. Os dados foram recarregados; volte a conferir o documento antes de confirmar.",
  refused: "O servidor recusou a confirmação. Os dados foram recarregados; volte a conferir o documento.",
  refusalDetails: {
    issue303_company_role_required: "A sessão tem de ser admin da empresa.",
    issue303_account_not_enabled: "A conta não tem o regime v2 disponível.",
    issue303_total_mismatch: "A soma das linhas diverge do total documental.",
    issue303_quota_mismatch: "A quota declarada do evento diverge das suas linhas.",
    issue303_event_already_confirmed: "O evento já tem um apuramento confirmado.",
    issue303_pending_document: "Existem linhas por documentar.",
    issue303_documentary_proof_required: "Falta prova documental verificada.",
    issue303_source_already_used: "Uma fonte já foi usada noutro apuramento.",
  } as Record<string, string>,
  invalidReceipt: "O servidor não devolveu um recibo válido. Recarregue e confira o estado do documento antes de continuar.",
  reloadFailed: "Não foi possível recarregar os dados. Reabra a conta antes de continuar.",
  receipt: "Recibo de confirmação", revision: "Revisão", balance: "Saldo / transporte", serverTime: "Instante do servidor",
  confirmedBy: "Confirmado por", calculatedTotal: "Total calculado", documentTotal: "Total do documento",
  pendingProof: "Existem linhas ou provas documentais por completar. A confirmação está bloqueada.",
  loadingProof: "A carregar provas documentais…", proofError: "Não foi possível carregar as provas documentais.",
  original: "Acerto do apuramento original", originalLine: "Linha original", adjustmentReason: "Motivo do acerto",
  types: {
    event_sales: "Vendas do evento após retenção", ticketline_invoice: "Fatura da bilheteira", venue_settlement: "Acerto da sala",
    advance: "Repasse", carry_over: "Transitado", opening_balance: "Saldo de abertura",
  } satisfies Record<TicketlineStatementLineType, string>,
};
const labels = statementDraftLabels;
type V2Read = Extract<TicketOfficeStatementsRead, { status: "v2" }>;
type Candidate = { id: string; name: string; settlementId: string | null; gross: string; retained: string; declared: string };
type TransactionSource = { id: string; eventId: string | null; groupId: string | null; description: string; cents: number; advance: boolean };
interface DraftLine {
  id: string; document_line_type: TicketlineStatementLineType; description: string; amount: string;
  event_id: string; ticket_office_settlement_id: string; transaction_id: string; invoice_group_id: string;
  quota_line_id: string; previous_statement_id: string; opening_note: string; pending_document: boolean;
  gross: string; retained: string; declared: string; source_sha256: string; document_page: string; document_line_ref: string;
  notes: string; positive_sign_evidence: string;
  adjusts_statement_id: string; adjusts_line_id: string; adjustment_reason: string;
}
const asCents = (value: unknown) => value === null || value === undefined ? "" : String(parseTicketlineStatementAmountCents(value));
function integer(value: string): number {
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(labels.invalidCents);
  return Number(value);
}
function newLine(type: TicketlineStatementLineType): DraftLine {
  return { id: crypto.randomUUID(), document_line_type: type, description: "", amount: "", event_id: "",
    ticket_office_settlement_id: "", transaction_id: "", invoice_group_id: "", quota_line_id: "", previous_statement_id: "",
    opening_note: "", pending_document: true, gross: "", retained: "", declared: "", source_sha256: "",
    document_page: "", document_line_ref: "", notes: "", positive_sign_evidence: "", adjusts_statement_id: "", adjusts_line_id: "", adjustment_reason: "" };
}
function initialLine(line: TicketOfficeStatementV2["ticket_office_statement_lines"][number]): DraftLine {
  const result = { ...newLine(line.document_line_type), id: line.id, amount: asCents(line.amount),
    gross: asCents(line.event_gross_amount), retained: asCents(line.event_retained_amount), declared: asCents(line.declared_event_net),
    pending_document: line.pending_document === true };
  for (const key of ["description", "event_id", "ticket_office_settlement_id", "transaction_id", "invoice_group_id", "quota_line_id",
    "previous_statement_id", "opening_note", "source_sha256", "document_line_ref", "notes", "positive_sign_evidence",
    "adjusts_statement_id", "adjusts_line_id", "adjustment_reason"] as const) result[key] = String(line[key] ?? "");
  result.document_page = line.document_page == null ? "" : String(line.document_page);
  return result;
}

/** Bounded complete reads: a safety limit is an error, never a partial candidate list. */
async function completeRead(query: ReturnType<typeof fetchAllPagedQuery>): Promise<Record<string, any>[]> {
  const { data, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data) || data.length >= 50000) throw new Error(labels.incomplete);
  return data;
}
async function loadSources(officeId: string, companyId: string): Promise<{ candidates: Candidate[]; transactions: TransactionSource[]; confirmedEventIds: string[] }> {
  const db = supabase as any;
  const [assignments, settlements, sales, transactions, memberships] = await Promise.all([
    completeRead(fetchAllPagedQuery(db.from("event_ticket_office_assignments").select("id, event_id, events!inner(id, name)")
      .eq("financial_account_id", officeId).eq("company_id", companyId))),
    completeRead(fetchAllPagedQuery(db.from("ticket_office_settlements").select("id, event_id, status, gross_revenue, venue_retained_amount, net_calculated, net_adjusted")
      .eq("financial_account_id", officeId).eq("company_id", companyId))),
    db.rpc("get_ticket_office_sales", { p_account_id: officeId }),
    completeRead(fetchAllPagedQuery(db.from("transactions").select("id, event_id, invoice_group_id, description, type, status, amount, paid_amount, reversed_at, currency, account_categories!transactions_category_id_fkey(code)")
      .eq("account_id", officeId).eq("company_id", companyId))),
    // Q3 is unique across accounts. R5's provenance is account-scoped; an event
    // assigned to this account may already have been confirmed on another one.
    fetchAllPaged<{ event_id: string }>((from, to) => db.from("ticket_office_statement_events").select("event_id")
      .eq("company_id", companyId).order("event_id", { ascending: true }).range(from, to), { maxRows: 50000 }),
  ]);
  if (sales.error) throw sales.error;
  if (!Array.isArray(sales.data) || memberships.length >= 50000) throw new Error(labels.incomplete);
  const candidates = [...new Map(assignments.map((a) => [a.event_id, a])).values()].map((a) => {
    const matches = settlements.filter((s) => s.event_id === a.event_id && s.status !== "reversed");
    if (matches.length > 1) throw new Error(labels.incomplete);
    const settlement = matches[0];
    const sale = sales.data.find((s: { event_id: string }) => s.event_id === a.event_id);
    return { id: a.event_id, name: a.events.name, settlementId: settlement?.id ?? null,
      gross: asCents(settlement?.gross_revenue ?? sale?.revenue), retained: asCents(settlement?.venue_retained_amount),
      declared: asCents(settlement?.net_adjusted ?? settlement?.net_calculated) };
  });
  return { candidates, confirmedEventIds: memberships.map((m) => m.event_id), transactions: transactions.filter((t) => !t.reversed_at && t.currency === "EUR" && ["expense", "income"].includes(t.type)).map((t) => {
    const cents = parseTicketlineStatementAmountCents(t.amount);
    return { id: t.id, eventId: t.event_id, groupId: t.invoice_group_id, description: t.description, cents: t.type === "expense" ? -cents : cents,
      advance: t.type === "expense" && t.status === "paid" && t.account_categories?.code === "10.3" && parseTicketlineStatementAmountCents(t.paid_amount) === cents };
  }) };
}

/** Q1 preview is civil time in the company zone, with no browser-zone conversion.
 * The exclusive local boundary is sufficient for display; only R4 resolves UTC,
 * PDF evidence and DST, on the server. No preview value is sent to the RPC.
 */
export function statementCutoffPreview(date: string, timezone: string) {
  if (!date || !timezone) return null;
  try {
    new Intl.DateTimeFormat("pt-PT", { timeZone: timezone }).format(0);
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const day = next.toISOString().slice(0, 10).split("-").reverse().join("/");
    return `${day} 00:00 · ${timezone}`;
  } catch { return null; }
}

interface Props {
  officeId: string; read: V2Read; statement?: TicketOfficeStatementV2;
  onClose: () => void; onSaved: () => Promise<void>; onConflict: () => Promise<void>;
  mode?: "draft" | "confirm"; onRejected?: (message: string) => Promise<void>;
}
export function TicketOfficeStatementModal(props: Props) {
  return props.mode === "confirm" && props.statement
    ? <StatementConfirmation {...props} statement={props.statement} />
    : <StatementDraft {...props} />;
}

// Only consume server receipt fields. The document number is read from the
// persisted header; 0346 does not return a number in the receipt.
const receiptMoney = z.union([z.string(), z.number()]).refine((value) => {
  try { parseTicketlineStatementAmountCents(value); return true; } catch { return false; }
});
const confirmationReceiptSchema = z.object({
  contract_version: z.literal(2), statement_id: z.string().min(1), revision: z.number().int().positive(),
  calculated_total: receiptMoney, independent_position: receiptMoney,
  confirmed_by: z.string().min(1), confirmed_at: z.string().datetime({ offset: true }), opening_approved: z.boolean(),
  opening: z.object({ line_id: z.string().min(1), amount: receiptMoney, note: z.string().min(1),
    approved_by: z.string().min(1), approved_at: z.string().datetime({ offset: true }) }).passthrough().nullable(),
  position_proof: z.object({ statement_id: z.string(), revision: z.number(), independent_position: receiptMoney,
    validator: z.literal("issue303-r4-v1"), contract_version: z.literal(2),
    position_cutoff_at: z.string().datetime({ offset: true }), position_timezone: z.string().min(1),
    position_cutoff_source: z.enum(["company_day_end", "pdf_explicit"]), primary_document_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sources: z.array(z.record(z.unknown())).min(1) }).passthrough(),
  lines: z.array(z.record(z.unknown())).min(1), documents: z.array(z.record(z.unknown())).min(1), sources: z.array(z.record(z.unknown())).min(1),
}).passthrough();
function receiptFor(statement: TicketOfficeStatementV2, value: unknown) {
  const receipt = confirmationReceiptSchema.parse(value);
  const cents = parseTicketlineStatementAmountCents;
  const opening = statement.ticket_office_statement_lines.find((line) => line.document_line_type === "opening_balance");
  if (receipt.statement_id !== statement.id || receipt.revision !== statement.revision
    || statement.document_total == null || cents(receipt.calculated_total) !== cents(statement.document_total)
    || cents(receipt.independent_position) !== cents(statement.document_total)
    || receipt.position_proof.statement_id !== statement.id || receipt.position_proof.revision !== statement.revision
    || cents(receipt.position_proof.independent_position) !== cents(statement.document_total)
    || receipt.position_proof.primary_document_sha256 !== statement.primary_document_sha256
    || !receipt.documents.some((document) => document.document_id === statement.primary_document_id && document.sha256 === statement.primary_document_sha256)
    || receipt.lines.length !== statement.ticket_office_statement_lines.length
    || statement.ticket_office_statement_lines.some((line) => !receipt.lines.some((frozen) => frozen.id === line.id && frozen.statement_id === statement.id && frozen.company_id === statement.company_id))
    || receipt.opening_approved !== !!opening || (receipt.opening?.line_id ?? null) !== (opening?.id ?? null)
    || (opening && (receipt.opening?.approved_by !== receipt.confirmed_by || receipt.opening?.approved_at !== receipt.confirmed_at
      || receipt.opening.note !== opening.opening_note || cents(receipt.opening.amount) !== cents(opening.amount)))) {
    throw new Error(labels.invalidReceipt);
  }
  return receipt;
}
export function TicketOfficeStatementReceipt({ statement, value }: { statement: TicketOfficeStatementV2; value: unknown }) {
  let receipt: ReturnType<typeof receiptFor>;
  try { receipt = receiptFor(statement, value); } catch { return <p role="alert">{labels.invalidReceipt}</p>; }
  return <section aria-label={labels.receipt} className="space-y-2 rounded border p-3 break-words">
    <h3 className="font-semibold">{labels.receipt}</h3>
    <dl className="text-sm space-y-1">
      <div><dt>{labels.number}</dt><dd>{statement.number}</dd></div>
      <div><dt>{labels.revision}</dt><dd>{receipt.revision}</dd></div>
      <div><dt>{labels.calculatedTotal}</dt><dd>{formatCurrency(Number(receipt.calculated_total))}</dd></div>
      <div><dt>{labels.balance}</dt><dd>{formatCurrency(Number(receipt.independent_position))}</dd></div>
      <div><dt>{labels.serverTime}</dt><dd><time dateTime={receipt.confirmed_at}>{receipt.confirmed_at}</time></dd></div>
      <div><dt>{labels.confirmedBy}</dt><dd>{receipt.confirmed_by}</dd></div>
    </dl>
    {receipt.opening_approved && <p>{labels.openingApproved}</p>}
  </section>;
}

function StatementConfirmation({ statement: initialStatement, read, onClose, onSaved, onRejected }: Props & { statement: TicketOfficeStatementV2 }) {
  const { role, user } = useAuth();
  const { companyId } = useCompany();
  const [statement] = useState(initialStatement);
  const [prompt, setPrompt] = useState(false);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [receipt, setReceipt] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const documents = useQuery({
    queryKey: ["ticket-office-statement-documents", companyId, user?.id, statement.id, statement.revision],
    enabled: !!companyId && !!user, retry: false,
    queryFn: () => loadStatementDocuments(statement.id, companyId!),
  });
  const lines = statement.ticket_office_statement_lines;
  const reconciliation = (() => {
    try {
      if (statement.document_total == null || !lines.length || lines.some((line) => line.amount == null)) return null;
      const sum = lines.reduce((acc, line) => acc + BigInt(parseTicketlineStatementAmountCents(line.amount)), 0n);
      return { sum, difference: BigInt(parseTicketlineStatementAmountCents(statement.document_total)) - sum };
    } catch { return null; }
  })();
  const opening = lines.find((line) => line.document_line_type === "opening_balance");
  const pending = !statement.primary_document_id || !statement.primary_document_sha256
    || !documents.data?.some((doc) => doc.id === statement.primary_document_id && doc.verified_sha256 === statement.primary_document_sha256 && doc.verified_file_id)
    || lines.some((line) =>
    line.pending_document || !line.source_sha256 || !line.document_page || !line.document_line_ref
    || (line.document_line_type === "event_sales" && read.provenance.eventMemberships.some((m) => m.event_id === line.event_id)));
  const canConfirm = role === "admin" && statement.status === "draft" && reconciliation?.difference === 0n && !pending && !busy && !blocked && !receipt;
  const confirm = async () => {
    if (!canConfirm || !prompt || (opening && !approved) || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { data, error: failure } = await (supabase as any).rpc("confirm_ticket_office_statement", {
        p_statement_id: statement.id, p_expected_revision: statement.revision, p_approve_opening: !!opening && approved,
      });
      if (failure) throw failure;
      try { receiptFor(statement, data); } catch { throw new Error(labels.invalidReceipt); }
      setReceipt(data); setPrompt(false); setBlocked(true);
    } catch (failure) {
      const e = failure as { code?: string; message?: string };
      const message = e.code === "40001" || e.message?.includes("issue303_revision_conflict") ? labels.confirmConflict
        : e.message === labels.invalidReceipt ? labels.invalidReceipt
        : `${labels.refused}${labels.refusalDetails[e.message ?? ""] ? ` ${labels.refusalDetails[e.message!]}` : ""}`;
      setBlocked(true); setPrompt(false); setError(message);
      try { await onRejected?.(message); } catch { setError(`${message} ${labels.reloadFailed}`); }
      return;
    } finally { setBusy(false); inFlight.current = false; }
    try { await onSaved(); } catch { setError(labels.reloadFailed); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-4xl" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{labels.confirmTitle}</DialogTitle><DialogDescription>{labels.confirmHelp}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <p>{labels.number}: {statement.number} · {labels.revision}: {statement.revision}</p>
        {receipt ? <TicketOfficeStatementReceipt statement={statement} value={receipt} /> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{lines.map((line) => <tr key={line.id}>
            <td className="pr-2">{labels.types[line.document_line_type]}</td><td className="pr-2">{line.description}
              <p>{labels.page}: {line.document_page ?? "—"} · {labels.reference}: {line.document_line_ref ?? "—"}</p></td>
            <td className="text-right">{line.amount == null ? labels.pending : formatCurrency(Number(line.amount))}</td>
          </tr>)}</tbody></table></div>
          <dl className="text-sm"><dt>{labels.sum}</dt><dd>{reconciliation ? String(reconciliation.sum) : "—"}</dd>
            <dt>{labels.total}</dt><dd>{asCents(statement.document_total) || "—"}</dd>
            <dt>{labels.difference}</dt><dd role="status">{reconciliation ? String(reconciliation.difference) : "—"}</dd></dl>
          {pending && <p>{labels.pendingProof}</p>}
          {documents.isPending && <p>{labels.loadingProof}</p>}
          {documents.isError && <p role="alert">{labels.proofError}</p>}
          {documents.data && <TicketOfficeStatementDocuments statementId={statement.id} documents={documents.data} canManage={false}
            v2={{ status: statement.status, revision: statement.revision }} />}
          {opening && <div><p>{labels.openingPending}</p><p>{opening.opening_note}</p><p>{formatCurrency(Number(opening.amount))}</p></div>}
          {prompt && role === "admin" ? <Dialog open onOpenChange={(open) => { if (!open && !busy) { setPrompt(false); setApproved(false); } }}>
            <DialogContent role="alertdialog" aria-label={labels.explicitConfirmation} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
              <DialogHeader><DialogTitle>{labels.explicitConfirmation}</DialogTitle><DialogDescription>{labels.confirmHelp}</DialogDescription></DialogHeader>
              <div className="space-y-3">
                {opening && <Label className="flex gap-2"><input type="checkbox" checked={approved} disabled={busy}
                  onChange={(e) => setApproved(e.target.checked)} />{labels.approveOpening}</Label>}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setPrompt(false); setApproved(false); }}>{labels.back}</Button>
                  <Button type="button" disabled={!canConfirm || (!!opening && !approved)} onClick={() => void confirm()}>{busy ? labels.confirming : labels.confirm}</Button></div>
              </div>
            </DialogContent>
          </Dialog> : role === "admin" && <Button type="button" disabled={!canConfirm} onClick={() => setPrompt(true)}>{labels.confirm}</Button>}
        </>}
        {error && <p role="alert">{error}</p>}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{labels.cancel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function StatementDraft({ officeId, read, statement: initialStatement, onClose, onSaved, onConflict }: Props) {
  const { company, companyId } = useCompany();
  const { user, isAdmin, isManager } = useAuth();
  // Bind the submitted revision to the form's original values. Background R5
  // refetches must never pair stale local edits with a newer server revision.
  const [statement] = useState(initialStatement);
  const [number, setNumber] = useState(String(statement?.number ?? ""));
  const [date, setDate] = useState(statement?.statement_date ?? "");
  const [total, setTotal] = useState(asCents(statement?.document_total));
  const [notes, setNotes] = useState(String(statement?.notes ?? ""));
  const [lines, setLines] = useState<DraftLine[]>(() => statement?.ticket_office_statement_lines.map(initialLine) ?? []);
  const [documents, setDocuments] = useState<StatementDocument[] | null>(statement ? null : []);
  const [primary, setPrimary] = useState(statement?.primary_document_id ?? "");
  const [addType, setAddType] = useState<TicketlineStatementLineType>("event_sales");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [hydrated, setHydrated] = useState(!statement);
  const sources = useQuery({
    queryKey: ["ticket-office-statement-draft-sources", companyId, user?.id, officeId, statement?.id, statement?.revision],
    enabled: !!companyId && !!user && (isAdmin || isManager), retry: false,
    queryFn: async () => {
      const [data, docs, headers, lineEvidence] = await Promise.all([loadSources(officeId, companyId!),
        statement ? loadStatementDocuments(statement.id, companyId!) : Promise.resolve([]),
        // R5 deliberately selects only provenance fields. Preserve editor-only
        // notes and positive-sign evidence instead of erasing them on save.
        statement ? completeRead(fetchAllPagedQuery((supabase as any).from("ticket_office_statements").select("id, revision, notes")
          .eq("id", statement.id).eq("company_id", companyId).eq("financial_account_id", officeId))) : Promise.resolve([]),
        statement ? completeRead(fetchAllPagedQuery((supabase as any).from("ticket_office_statement_lines").select("id, positive_sign_evidence")
          .eq("statement_id", statement.id).eq("company_id", companyId))) : Promise.resolve([]),
      ]);
      if (statement && (headers.length !== 1 || headers[0].revision !== statement.revision
        || lineEvidence.length !== statement.ticket_office_statement_lines.length
        || statement.ticket_office_statement_lines.some((line) => !lineEvidence.some((e) => e.id === line.id)))) throw new Error(labels.conflict);
      return { ...data, documents: docs, header: headers[0], lineEvidence };
    },
  });
  useEffect(() => {
    if (hydrated || !sources.data) return;
    setNotes(sources.data.header?.notes ?? "");
    setLines((old) => old.map((line) => ({ ...line,
      positive_sign_evidence: sources.data.lineEvidence.find((e) => e.id === line.id)?.positive_sign_evidence ?? "" })));
    setHydrated(true);
  }, [hydrated, sources.data]);
  const docs = documents ?? sources.data?.documents ?? [];
  const otherDocuments = [...read.confirmedStatements, ...read.draftStatements, ...read.legacyStatements].filter((s) => s.id !== statement?.id);
  const first = otherDocuments.length === 0 && !read.confirmedStatements.some((s) => s.provenance.opening?.approval);
  const predecessor = statement?.predecessor_statement_id ?? read.confirmedStatements[0]?.id
    ?? read.legacyStatements.find((s) => s.status === "confirmed")?.id ?? "";
  const confirmedEvents = new Set([...read.provenance.eventMemberships.map((m) => m.event_id), ...(sources.data?.confirmedEventIds ?? [])]);
  const candidates = (sources.data?.candidates ?? []).filter((c) => !confirmedEvents.has(c.id));
  const candidateValues = (c: Candidate): Partial<DraftLine> => ({ event_id: c.id, description: c.name,
    ticket_office_settlement_id: c.settlementId ?? "", gross: c.gross, retained: c.retained, declared: c.declared,
    amount: c.gross !== "" && c.retained !== "" ? String(integer(c.gross) - integer(c.retained)) : "", pending_document: true });
  const usedLines = [...read.confirmedStatements, ...read.draftStatements, ...read.legacyStatements]
    .filter((s) => s.id !== statement?.id).flatMap((s) => s.ticket_office_statement_lines ?? []);
  const transactions = (sources.data?.transactions ?? []).filter((t) => !usedLines.some((l) =>
    ("transaction_id" in l && l.transaction_id === t.id) || (t.groupId && "invoice_group_id" in l && l.invoice_group_id === t.groupId)));
  const update = (id: string, patch: Partial<DraftLine>) => setLines((old) => old.map((l) => l.id === id ? { ...l, ...patch } : l));
  const cutoff = statementCutoffPreview(date, company?.timezone);
  const sums = (() => {
    try {
      const sum = lines.reduce((acc, line) => acc + BigInt(integer(line.amount)), 0n);
      return { sum: String(sum), difference: total ? String(BigInt(integer(total)) - sum) : null };
    } catch { return null; }
  })();
  const save = async () => {
    if (saving || conflicted || !hydrated || sources.isPending || sources.isError || !companyId || !(isAdmin || isManager)) return;
    setError(null); setSaving(true);
    try {
      if (!number.trim() || !date || total === "") throw new Error(labels.required);
      const payloadLines = lines.map((line, position) => {
        if (line.document_line_type === "opening_balance" && !first) throw new Error(labels.invalidOpening);
        if ((line.document_line_type === "opening_balance" && !line.opening_note.trim())
          || (line.document_line_type === "event_sales" && (!line.event_id || confirmedEvents.has(line.event_id)))) throw new Error(labels.invalidLine);
        const { amount, gross, retained, declared, ...rest } = line;
        return { ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v])),
          position, amount_cents: amount === "" && line.pending_document ? null : integer(amount),
          event_gross_cents: line.document_line_type === "event_sales" ? integer(gross) : null,
          event_retained_cents: line.document_line_type === "event_sales" ? integer(retained) : null,
          declared_event_net_cents: line.document_line_type === "event_sales" ? integer(declared) : null,
          document_page: line.document_page ? integer(line.document_page) : null };
      });
      const { data, error: rpcError } = await (supabase as any).rpc("save_ticket_office_statement_draft", {
        p_statement_id: statement?.id ?? null, p_expected_revision: statement?.revision ?? 0,
        p_payload: { financial_account_id: officeId, number: number.trim(), statement_date: date,
          document_total_cents: integer(total), notes: notes || null, predecessor_statement_id: predecessor || null,
          primary_document_id: primary || null, documents: statementDraftDocuments(docs), lines: payloadLines },
      });
      if (rpcError) throw rpcError;
      if (data?.contract_version !== 2 || data?.status !== "draft" || typeof data.statement_id !== "string"
        || !Number.isSafeInteger(data.revision) || data.revision !== (statement?.revision ?? 0) + 1
        || (statement && data.statement_id !== statement.id)) throw new Error(labels.missingRevision);
      await onSaved(); onClose();
    } catch (e) {
      const failure = e as { code?: string; message?: string };
      if (failure.code === "40001" || failure.message?.includes("issue303_revision_conflict")) {
        setConflicted(true); setError(labels.conflict); await onConflict();
      } else setError(failure.message ?? labels.failed);
    } finally { setSaving(false); }
  };
  const field = (line: DraftLine, key: keyof DraftLine, label: string, numeric = false) => (
    <Label className="block space-y-1">{label}<Input value={String(line[key])} inputMode={numeric ? "numeric" : undefined}
      disabled={line.document_line_type === "opening_balance" && !first}
      onChange={(e) => update(line.id, { [key]: e.target.value })} /></Label>
  );
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-4xl" onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{labels.title}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset disabled={saving || conflicted || !sources.data || !hydrated} className="space-y-4">
          <Label className="block space-y-1">{labels.number}<Input value={number} onChange={(e) => setNumber(e.target.value)} /></Label>
          <Label className="block space-y-1" htmlFor="statement-date">{labels.date}</Label>
          <DatePicker id="statement-date" aria-label={labels.date} value={date} onChange={setDate} clearable disabled={saving || conflicted} />
          <Label className="block space-y-1">{labels.total}<Input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></Label>
          <dl className="text-sm"><dt>{labels.timezone}</dt><dd>{company?.timezone || labels.unknownTimezone}</dd>
            <dt>{labels.cutoff}</dt><dd>{cutoff ?? "—"}</dd></dl><p className="text-xs text-muted-foreground">{labels.cutoffHelp}</p>
          {!first && <p className="text-sm">{labels.previous}: {predecessor ? [...read.confirmedStatements, ...read.legacyStatements].find((s) => s.id === predecessor)?.number ?? predecessor : "—"}</p>}
          <Label className="block space-y-1">{labels.notes}<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Label>
          {sources.isPending && <p role="status">{labels.loading}</p>}
          {sources.isError && <p role="alert">{labels.sourceError}</p>}
          <h3 className="font-semibold">{labels.lines}</h3>
          <Label className="block">{labels.candidates}<select className="block w-full rounded border bg-background p-2" value="" disabled={!sources.data}
            onChange={(e) => {
              const c = candidates.find((item) => item.id === e.target.value);
              if (!c) return;
              setLines((old) => [...old, { ...newLine("event_sales"), ...candidateValues(c) }]);
            }}><option value="">{labels.chooseEvent}</option>{candidates.filter((c) => !lines.some((l) => l.document_line_type === "event_sales" && l.event_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Label>
          {lines.map((line) => <fieldset key={line.id} className="space-y-3 rounded border p-3">
            <legend>{labels.types[line.document_line_type]}</legend>
            {line.document_line_type === "event_sales" && <Label className="block">{labels.event}<select className="block w-full rounded border bg-background p-2" value={line.event_id}
              onChange={(e) => {
                const c = candidates.find((item) => item.id === e.target.value);
                update(line.id, c ? candidateValues(c) : { event_id: "", ticket_office_settlement_id: "", gross: "", retained: "", declared: "", amount: "" });
              }}>
              <option value="">{labels.chooseEvent}</option>{candidates.filter((c) => !lines.some((l) => l.id !== line.id && l.document_line_type === "event_sales" && l.event_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></Label>}
            {field(line, "description", labels.descriptionLine)}{field(line, "amount", labels.amount, true)}
            {line.document_line_type === "event_sales" && <>{field(line, "gross", labels.gross, true)}{field(line, "retained", labels.retained, true)}{field(line, "declared", labels.declared, true)}</>}
            {["advance", "ticketline_invoice", "venue_settlement"].includes(line.document_line_type) && <>
              <Label className="block">{labels.sourceTransaction}<select className="block w-full rounded border bg-background p-2" value={line.transaction_id}
                onChange={(e) => {
                  const t = transactions.find((item) => item.id === e.target.value);
                  if (!t) return;
                  update(line.id, { transaction_id: t.id, invoice_group_id: "", amount: String(t.cents), description: t.description,
                    // Q3: an advance remains an account movement even when the historical transaction has an event.
                    event_id: line.document_line_type === "advance" ? "" : line.event_id, pending_document: true });
                }}><option value="">{labels.noTransaction}</option>
                {transactions.filter((t) => (line.document_line_type !== "advance" || t.advance) && !lines.some((l) => l.id !== line.id && l.transaction_id === t.id))
                  .map((t) => <option key={t.id} value={t.id}>{t.description} · {t.cents}</option>)}
              </select></Label>{field(line, "transaction_id", labels.transaction)}
            </>}
            {["ticketline_invoice", "venue_settlement"].includes(line.document_line_type) && <>
              {field(line, "invoice_group_id", labels.invoiceGroup)}
              <Label className="block">{labels.quota}<select className="block w-full rounded border bg-background p-2" value={line.quota_line_id} onChange={(e) => {
                const quota = lines.find((l) => l.id === e.target.value); update(line.id, { quota_line_id: e.target.value, event_id: quota?.event_id ?? "" });
              }}><option value="">{labels.noQuota}</option>{lines.filter((l) => l.document_line_type === "event_sales").map((l) => <option key={l.id} value={l.id}>{l.description || l.event_id}</option>)}</select></Label>
              {field(line, "positive_sign_evidence", labels.positiveEvidence)}{field(line, "notes", labels.reason)}
            </>}
            {line.document_line_type === "carry_over" && field(line, "previous_statement_id", labels.previous)}
            {line.document_line_type === "opening_balance" && <>{field(line, "opening_note", labels.openingNote)}<p className="text-xs text-muted-foreground">{labels.openingHelp}</p></>}
            <Label className="block">{labels.source}<select className="block w-full rounded border bg-background p-2" value={line.source_sha256} onChange={(e) => update(line.id, { source_sha256: e.target.value })}>
              <option value="">{labels.noSource}</option>{docs.filter((d) => d.verified_sha256).map((d) => <option key={d.id} value={d.verified_sha256}>{d.file_name}</option>)}</select></Label>
            {field(line, "document_page", labels.page, true)}{field(line, "document_line_ref", labels.reference)}
            <Label className="flex items-center gap-2"><input type="checkbox" checked={line.pending_document} onChange={(e) => update(line.id, { pending_document: e.target.checked })} />{labels.pending}</Label>
            <Button type="button" variant="outline" onClick={() => setLines((old) => old.filter((l) => l.id !== line.id))}>{labels.remove}</Button>
          </fieldset>)}
          <div className="flex flex-wrap gap-2"><Label>{labels.type}<select className="block rounded border bg-background p-2" value={addType} onChange={(e) => setAddType(e.target.value as TicketlineStatementLineType)}>
            {TICKETLINE_STATEMENT_LINE_TYPES.filter((type) => type !== "opening_balance" || first).map((type) => <option key={type} value={type}>{labels.types[type]}</option>)}
          </select></Label><Button type="button" variant="outline" disabled={addType === "opening_balance" && (!first || lines.some((l) => l.document_line_type === "opening_balance"))}
            onClick={() => setLines((old) => [...old, { ...newLine(addType), ...(addType === "carry_over" ? { previous_statement_id: predecessor } : {}) }])}>{labels.add}</Button></div>
          {sums && <dl className="text-sm"><dt>{labels.sum}</dt><dd>{sums.sum}</dd><dt>{labels.difference}</dt><dd>{sums.difference ?? "—"}</dd></dl>}
          <Label className="block">{statementDocumentLabels.primary}<select className="block w-full rounded border bg-background p-2" value={primary} onChange={(e) => setPrimary(e.target.value)}>
            <option value="">{statementDocumentLabels.noPrimary}</option>{docs.filter((d) => d.document_source === "apuramento" && d.mime_type === "application/pdf" && d.verified_file_id).map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select></Label>
          <TicketOfficeStatementDocuments statementId={statement?.id ?? ""} documents={docs} canManage={isAdmin || isManager} userId={user?.id}
            v2={{ status: "draft", revision: statement?.revision ?? 0 }} onDocumentsChange={(next) => { setDocuments(next); if (!next.some((d) => d.id === primary)) setPrimary(""); }} />
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>{labels.cancel}</Button>
          <Button type="submit" disabled={saving || conflicted || !hydrated || !sources.data || sources.isError || !(isAdmin || isManager)}>{saving ? labels.saving : labels.save}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
