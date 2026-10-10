/**
 * #271 — fechos de bilheteira por evento (eventId) ou transversais (sem eventId, com filtros).
 * Lê só por get_ticket_office_settlements_overview (SECURITY DEFINER, filtrado por empresa activa).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { settlementFormLabel, SETTLEMENT_STATUS_LABELS } from "@/lib/ticket-office-settlement-form";

interface Row {
  id: string;
  event_id: string | null;
  event_name: string | null;
  office_id: string | null;
  office_name: string | null;
  settlement_date: string | null;
  status: string;
  gross_revenue: number | null;
  total_deductions: number | null;
  net_value: number | null;
  net_transferred: number | null;
  forma_liquidacao: string;
  forma_derivada: string;
  forma_manual: string | null;
  forma_manual_notes: string | null;
  statement_id: string | null;
  statement_number: string | null;
  notes: string | null;
  adjustment_notes: string | null;
}

const ddmmyyyy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function TicketOfficeSettlementsOverview({ eventId }: { eventId?: string }) {
  const { companyId } = useCompany();
  const [office, setOffice] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ticket_office_settlements_overview", companyId, eventId ?? null],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticket_office_settlements_overview" as any, {
        _event_id: eventId ?? null,
        _office_id: null,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const offices = useMemo(() => Array.from(new Set(rows.map((r) => r.office_name).filter(Boolean))) as string[], [rows]);
  const events = useMemo(() => Array.from(new Set(rows.map((r) => r.event_name).filter(Boolean))) as string[], [rows]);
  const shown = rows.filter((r) => (!office || r.office_name === office) && (!eventFilter || r.event_name === eventFilter));

  if (eventId && !isLoading && rows.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {eventId ? "Fecho de bilheteira" : "Todos os fechos de bilheteira"}
        </p>
        {!eventId && (
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filtrar por bilheteira" value={office} onChange={(e) => setOffice(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
              <option value="">Todas as bilheteiras</option>
              {offices.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select aria-label="Filtrar por evento" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
              <option value="">Todos os eventos</option>
              {events.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}
      {!isLoading && shown.length === 0 && <p className="text-xs text-muted-foreground">Sem fechos.</p>}
      {shown.map((r) => (
        <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{r.event_name ?? "Sem evento"} — {r.office_name ?? "—"}</span>
            <span className="text-xs text-muted-foreground">
              {ddmmyyyy(r.settlement_date)} · {SETTLEMENT_STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted-foreground">Bruto</dt><dd>{formatCurrency(Number(r.gross_revenue ?? 0))}</dd></div>
            <div><dt className="text-muted-foreground">Deduções</dt><dd>{formatCurrency(Number(r.total_deductions ?? 0))}</dd></div>
            <div><dt className="text-muted-foreground">Direito do evento</dt><dd className="font-medium">{formatCurrency(Number(r.net_value ?? 0))}</dd></div>
          </dl>
          <p className="text-xs">
            <span className="text-muted-foreground">Forma de liquidação: </span>
            {settlementFormLabel(r.forma_liquidacao, r.statement_number)}
            {r.forma_manual ? (
              <span className="text-muted-foreground"> (declarada à mão; derivada: {settlementFormLabel(r.forma_derivada, r.statement_number)}{r.forma_manual_notes ? ` — ${r.forma_manual_notes}` : ""})</span>
            ) : (
              <span className="text-muted-foreground"> (derivada)</span>
            )}
            {r.statement_id && (
              <> · <a href={`/bilheteiras#apuramento-${r.statement_id}`} className="text-primary hover:underline">ver apuramento</a></>
            )}
          </p>
          <p className="text-xs whitespace-pre-wrap">
            <span className="text-muted-foreground">Notas: </span>{r.notes?.trim() || "sem notas"}
          </p>
          {r.adjustment_notes?.trim() && (
            <p className="text-xs whitespace-pre-wrap"><span className="text-muted-foreground">Notas do ajuste: </span>{r.adjustment_notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}
