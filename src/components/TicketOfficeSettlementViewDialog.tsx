import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { formatLisbonDateTime } from "@/lib/date-lisbon";
import { openStatementDocument, sourceLabel } from "@/lib/ticket-office-statement-documents";
import { fetchSettlementView, SETTLEMENT_STATUS_LABEL, type SettlementView, type SettlementEventRight } from "@/lib/ticket-office-settlement-view";

export function SettlementEventRightContent({ right }: { right: SettlementEventRight }) {
  return <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 space-y-1 text-sm" data-testid="settlement-event-right">
    <p className="font-semibold">Direito do evento (quota documental do PDF): {formatCurrency(right.amount)}</p>
    <p>Congelado · apuramento confirmado nº {right.statementNumber}</p>
    <p>Bruto documental: {formatCurrency(right.gross)} · Retido pela sala: {formatCurrency(right.retained)}</p>
    {right.deductions.map(d => <p key={d.id}>{d.description}: {formatCurrency(d.amount)}</p>)}
    <p className="text-xs text-muted-foreground">{right.documentPage ? `PDF · página ${right.documentPage}` : "PDF"}{right.documentLineRef ? ` · ${right.documentLineRef}` : ""}. A transferência efectiva é apresentada separadamente.</p>
    <a href={right.href} className="text-primary hover:underline">ver apuramento</a>
  </div>;
}

/** Corpo de leitura do fecho — sem campos editáveis, nada grava. */
export function SettlementReadContent({ v }: { v: SettlementView }) {
  return (
    <div className="space-y-4 text-sm" data-testid="settlement-read">
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Evento: <span className="text-foreground">{v.eventName}</span>{v.eventDate ? ` · ${formatDatePT(v.eventDate)}` : ""}</p>
        <p>Data do fecho: {formatDatePT(v.settlementDate)} · Estado: <span className="text-foreground">{SETTLEMENT_STATUS_LABEL[v.status] ?? v.status}</span></p>
        {v.statementNumber && <p>Apuramento Ticketline nº {v.statementNumber}</p>}
      </div>

      {v.eventRight && <SettlementEventRightContent right={v.eventRight} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Bruto", formatCurrency(v.grossRevenue)],
          ["Deduções", `−${formatCurrency(v.totalDeductions)}`],
          ["Direito do evento", formatCurrency(v.netFinal)],
          ["Transferido", formatCurrency(v.netTransferred)],
        ].map(([l, val]) => (
          <div key={l} className="rounded-lg bg-secondary/40 p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">{l}</p>
            <p className="font-mono font-semibold">{val}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="font-semibold mb-1">Deduções</p>
        {v.deductions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem deduções ligadas.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left py-1">Descrição</th><th className="text-left">Fornecedor</th><th className="text-right">Valor</th></tr>
            </thead>
            <tbody>
              {v.deductions.map((d) => (
                <tr key={d.id} className="border-t border-border/40">
                  <td className="py-1">{d.description}</td>
                  <td>{d.supplier ?? "—"}</td>
                  <td className="text-right font-mono">{formatCurrency(d.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1">Total</td><td /><td className="text-right font-mono">−{formatCurrency(v.totalDeductions)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {v.venueRetainedAmount > 0 && (
        <p><span className="font-semibold">Retido pela sala:</span> <span className="font-mono">{formatCurrency(v.venueRetainedAmount)}</span>{v.venueRetainedNotes ? <span className="text-muted-foreground italic"> — {v.venueRetainedNotes}</span> : null}</p>
      )}
      {v.venueRemainderPaid && v.venueRemainderAmount > 0 && (
        <p><span className="font-semibold">Saldo restante da fatura pago pela bilheteira:</span> <span className="font-mono">{formatCurrency(v.venueRemainderAmount)}</span></p>
      )}
      {v.formaManual && (
        <p><span className="font-semibold">Forma de liquidação manual:</span> {v.formaManual}{v.formaManualNotes ? ` — ${v.formaManualNotes}` : ""}</p>
      )}
      {v.notes && <p><span className="font-semibold">Notas do fecho:</span> {v.notes}</p>}
      {v.adjustmentNotes && <p><span className="font-semibold">Notas de ajuste:</span> {v.adjustmentNotes}</p>}
      {v.grossAdjustmentNotes && <p><span className="font-semibold">Notas de ajuste do bruto:</span> {v.grossAdjustmentNotes}</p>}
      {v.statementNumber && v.statementDocuments.length > 0 && (
        <div data-testid="settlement-statement-docs">
          <p className="font-semibold mb-1">Documentos do apuramento {v.statementNumber}</p>
          <ul className="space-y-0.5">
            {v.statementDocuments.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="hover:underline text-left"
                  onClick={async () => { const err = await openStatementDocument(d.filePath); if (err) toast.error(err); }}
                >{d.fileName}</button>
                <span className="text-xs text-muted-foreground"> · {sourceLabel(d.source)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.status === "confirmed" && (
        <p className="text-xs text-muted-foreground">Fechado por {v.closedByName ?? "—"}{v.closedAt ? ` em ${formatLisbonDateTime(v.closedAt)}` : ""}</p>
      )}
    </div>
  );
}

interface Props {
  settlement: any | null;
  officeName: string;
  onClose: () => void;
}

export function TicketOfficeSettlementViewDialog({ settlement, officeName, onClose }: Props) {
  const [exporting, setExporting] = useState(false);
  const { data: view, isLoading, isError } = useQuery({
    queryKey: ["ticket_office_settlement_view", settlement?.company_id, settlement?.financial_account_id, settlement?.id],
    enabled: !!settlement,
    queryFn: () => fetchSettlementView(settlement, officeName),
  });

  const savePdf = async () => {
    if (!view) return;
    setExporting(true);
    try {
      const { exportTicketOfficeSettlementPdf } = await import("@/lib/export-ticket-office-settlement-pdf");
      await exportTicketOfficeSettlementPdf(view);
    } catch (e: any) {
      toast.error("Erro ao gerar PDF", { description: e?.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={!!settlement} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fecho — {settlement?.events?.name ?? "—"}</DialogTitle>
          <DialogDescription>{officeName} · só leitura</DialogDescription>
        </DialogHeader>
        {isError ? <p role="alert">Não foi possível ler o direito documental do evento.</p> : isLoading || !view ? (
          <p className="text-center text-muted-foreground py-6">A carregar…</p>
        ) : (
          <SettlementReadContent v={view} />
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={savePdf} disabled={!view || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Guardar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
