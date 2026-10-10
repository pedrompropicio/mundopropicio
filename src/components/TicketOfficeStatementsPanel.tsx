import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { statementTypeTotals } from "@/lib/ticket-office-position";

const SUMMARY_LABEL: Record<string, string> = {
  event_right: "Direitos dos eventos apurados",
  venue_settlement: "Acerto de sala",
  ticketline_invoice: "Faturas da Ticketline",
  advance: "Repasses do período",
  carry_over: "Transitado do apuramento anterior",
};

const TYPE_LABEL: Record<string, string> = {
  event_right: "Direito do evento",
  ticketline_invoice: "Fatura Ticketline",
  venue_settlement: "Acerto da sala",
  advance: "Repasse",
  carry_over: "Transitado",
};

/**
 * Apuramentos Ticketline (#303) — só leitura. Σ linhas vs total do documento;
 * linhas pendentes de documento ficam destacadas e bloqueiam a confirmação.
 */
export function TicketOfficeStatementsPanel({ officeId }: { officeId?: string } = {}) {
  const { data = [] } = useQuery({
    queryKey: ["ticket-office-statements", officeId ?? null],
    queryFn: async () => {
      let q = (supabase as any)
        .from("ticket_office_statements")
        .select("id, number, statement_date, document_total, status, notes, ticket_office_statement_lines!ticket_office_statement_lines_statement_id_fkey(id, line_type, position, description, amount, pending_document, notes)")
        .order("statement_date", { ascending: false });
      if (officeId) q = q.eq("financial_account_id", officeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!data.length) return <p className="text-sm text-muted-foreground">Sem apuramentos registados nesta bilheteira.</p>;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Apuramentos Ticketline</h2>
      {data.map((s: any) => {
        const lines = [...(s.ticket_office_statement_lines ?? [])].sort((a: any, b: any) => a.position - b.position);
        const sum = lines.reduce((acc: number, l: any) => acc + Number(l.amount ?? 0), 0);
        const pending = lines.filter((l: any) => l.pending_document);
        const diff = s.document_total != null ? Number(s.document_total) - sum : null;
        const totals = statementTypeTotals(lines);
        return (
          <div key={s.id} id={`apuramento-${s.id}`} className="rounded-lg border border-border bg-card p-4 space-y-2 scroll-mt-20">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Apuramento {s.number}</span>
              <span className="text-xs text-muted-foreground">{s.statement_date}</span>
              <Badge variant={s.status === "confirmed" ? "default" : "outline"}>{s.status === "confirmed" ? "Confirmado" : "Rascunho"}</Badge>
              {pending.length > 0 && (
                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {pending.length} pendente(s) de documento</Badge>
              )}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {lines.map((l: any) => (
                  <tr key={l.id} className={l.pending_document ? "text-destructive" : ""}>
                    <td className="py-0.5 pr-2 text-xs text-muted-foreground whitespace-nowrap">{TYPE_LABEL[l.line_type] ?? l.line_type}</td>
                    <td className="py-0.5 pr-2">{l.description}</td>
                    <td className="py-0.5 text-right font-mono whitespace-nowrap">{l.amount == null ? "por documentar" : formatCurrency(Number(l.amount))}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold">
                  <td colSpan={2} className="pt-1">Σ linhas</td>
                  <td className="pt-1 text-right font-mono">{formatCurrency(sum)}</td>
                </tr>
                {s.document_total != null && (
                  <tr>
                    <td colSpan={2} className="text-muted-foreground">Total do apuramento (posição a fechar){diff != null && Math.abs(diff) > 0.005 ? ` · diferença ${formatCurrency(diff)} por documentar` : ""}</td>
                    <td className="text-right font-mono">{formatCurrency(Number(s.document_total))}</td>
                  </tr>
                )}
              </tbody>
            </table></div>
            <dl className="border-t border-border pt-3 space-y-1 text-sm">
              {Object.entries(SUMMARY_LABEL).filter(([type]) => type in totals).map(([type, label]) => (
                <div key={type} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-mono whitespace-nowrap">{formatCurrency(totals[type])}</dd></div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold"><dt>= Posição a fechar</dt><dd className="font-mono whitespace-nowrap">{formatCurrency(sum)}</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">{sum < -0.005 ? `A bilheteira adiantou ${formatCurrency(Math.abs(sum))} a mais do que os eventos renderam e leva esse valor como crédito para o apuramento seguinte.` : sum > 0.005 ? `A bilheteira tem ${formatCurrency(sum)} a entregar à MP.` : "A posição está a zero: não há valor a entregar à MP nem crédito a levar para o apuramento seguinte."}</p>
            {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
          </div>
        );
      })}
    </section>
  );
}
