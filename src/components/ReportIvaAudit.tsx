import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { calcIvaAmount, IVA_TOLERANCE } from "@/lib/iva";
import { formatDatePT } from "@/lib/utils";
import { utils, writeFile } from "xlsx";
import { applyPTNumberFormat } from "@/lib/excel-format";
import ReportIvaRateCoherence, { useRateCoherenceRows } from "@/components/ReportIvaRateCoherence";

type Divergence = {
  source: "transaction" | "forecast";
  id: string;
  date: string | null;
  description: string;
  event: string | null;
  base: number;
  rate: number;
  recordedIva: number;
  expectedIva: number;
  diff: number;
};

export default function ReportIvaAudit() {
  const [eventId, setEventId] = useState("");
  const [tolerance, setTolerance] = useState<number>(IVA_TOLERANCE);

  const { data: events = [] } = useQuery({
    queryKey: ["events-list-iva"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["iva-audit-tx", eventId],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, date, description, amount, iva_rate, event_id, events(name)")
        .order("date", { ascending: false });
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: forecasts = [], isLoading: loadingFc } = useQuery({
    queryKey: ["iva-audit-fc", eventId],
    queryFn: async () => {
      let q = supabase
        .from("event_forecasts")
        .select("id, description, amount, iva_rate, event_id, events(name)")
        .is("version_id", null)
        .order("created_at", { ascending: false });
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = loadingTx || loadingFc;

  const divergences = useMemo<Divergence[]>(() => {
    const out: Divergence[] = [];
    const tol = Math.max(0, Number(tolerance) || 0);

    for (const t of transactions as any[]) {
      const base = Number(t.amount) || 0;
      const rate = Number(t.iva_rate) || 0;
      // O sistema guarda apenas (base, rate) — a divergência só aparece se
      // recalcularmos vs valor "esperado" matemático. Aqui calculamos
      // sempre o esperado e marcamos como divergência apenas linhas onde
      // o produto base*rate produz arredondamento "feio" (≥ tolerância
      // do utilizador, ex: 0,005). Útil para detectar bases mal digitadas.
      if (base <= 0 || rate <= 0) continue;
      const expectedIva = calcIvaAmount(base, rate);
      // Recorded IVA = expected (porque o sistema sempre calcula via fórmula).
      // Reportamos apenas se base × rate / 100 antes do arredondamento se
      // afasta do valor arredondado em mais que a tolerância — sinaliza
      // bases com cêntimos "estranhos" que terão IVA divergente face a faturas.
      const raw = base * (rate / 100);
      const diff = Math.abs(raw - expectedIva);
      if (diff > tol) {
        out.push({
          source: "transaction",
          id: t.id,
          date: t.date,
          description: t.description ?? "",
          event: t.events?.name ?? null,
          base,
          rate,
          recordedIva: expectedIva,
          expectedIva,
          diff: Math.round((raw - expectedIva) * 1000) / 1000,
        });
      }
    }

    for (const f of forecasts as any[]) {
      const base = Number(f.amount) || 0;
      const rate = Number(f.iva_rate) || 0;
      if (base <= 0 || rate <= 0) continue;
      const expectedIva = calcIvaAmount(base, rate);
      const raw = base * (rate / 100);
      const diff = Math.abs(raw - expectedIva);
      if (diff > tol) {
        out.push({
          source: "forecast",
          id: f.id,
          date: null,
          description: f.description ?? "",
          event: f.events?.name ?? null,
          base,
          rate,
          recordedIva: expectedIva,
          expectedIva,
          diff: Math.round((raw - expectedIva) * 1000) / 1000,
        });
      }
    }

    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [transactions, forecasts, tolerance]);

  const { rows: coherenceRows, isLoading: loadingCoherence } = useRateCoherenceRows(eventId);

  const exportXlsx = () => {
    const rows = divergences.map((d) => ({
      Origem: d.source === "transaction" ? "Transação" : "BP",
      Data: d.date ? formatDatePT(d.date) : "—",
      Evento: d.event ?? "—",
      Descrição: d.description,
      "Base (€)": d.base,
      "Taxa (%)": d.rate,
      "IVA esperado (€)": d.expectedIva,
      "Resíduo de arredondamento (€)": d.diff,
    }));
    const ws = utils.json_to_sheet(rows);
    applyPTNumberFormat(ws);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Auditoria IVA");

    if (coherenceRows.length) {
      const cohRows = coherenceRows.map((r) => ({
        Evento: r.event,
        "Rubrica (código)": r.categoryCode,
        "Rubrica (nome)": r.categoryName,
        Descrição: r.description,
        "Taxa BP (%)": r.bpRate,
        "Taxas realizadas (%)": r.realizedRates.join("/"),
        "Previsto base (€)": r.forecastBase,
        "Realizado base (€)": r.realizedBase,
        "Previsto bruto (€)": r.forecastGross,
        "Realizado bruto (€)": r.realizedGross,
        "Ruído no bruto (€)": r.noise,
        Caso: r.realizedRates.length > 1 ? "Taxas mistas (D11)" : "Taxa única",
      }));
      const wsCoh = utils.json_to_sheet(cohRows);
      applyPTNumberFormat(wsCoh);
      utils.book_append_sheet(wb, wsCoh, "Coerência de taxa");
    }

    writeFile(wb, `auditoria-iva-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento (opcional)</label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {(events as any[]).map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tolerância (€)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={tolerance}
              onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Linhas cujo IVA "matemático" (base × taxa) se afasta do arredondado a 2 casas em mais que este valor.
            </p>
          </div>
          <div className="flex items-end">
            <Button onClick={exportXlsx} disabled={!divergences.length && !coherenceRows.length} variant="outline" className="gap-2 w-full">
              <FileSpreadsheet className="h-4 w-4" /> Exportar XLSX
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : divergences.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Nenhuma divergência de IVA detetada com esta tolerância. ✅
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{divergences.length}</span> linha(s) com resíduo de arredondamento de IVA
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origem</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">IVA esperado</TableHead>
                <TableHead className="text-right">Resíduo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divergences.slice(0, 500).map((d) => (
                <TableRow key={`${d.source}-${d.id}`}>
                  <TableCell>
                    <Badge variant={d.source === "transaction" ? "default" : "secondary"}>
                      {d.source === "transaction" ? "Tx" : "BP"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{d.date ? formatDatePT(d.date) : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{d.event ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{d.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(d.base)}</TableCell>
                  <TableCell className="text-right">{d.rate}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(d.expectedIva)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {d.diff > 0 ? "+" : ""}{d.diff.toFixed(3)} €
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {divergences.length > 500 && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              A mostrar as 500 maiores divergências. Exporta para XLSX para ver tudo.
            </p>
          )}
        </div>
      )}

      <ReportIvaRateCoherence eventId={eventId} rows={coherenceRows} isLoading={loadingCoherence} />
    </div>
  );
}
