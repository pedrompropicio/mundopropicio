import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

type CalibrationRow = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  window_days: number;
  total_qty: number;
  first_sale_date: string | null;
  last_sale_date: string | null;
  base_window_days: number;
  base_qty: number;
  base_velocity: number;
  final_qty: number;
  final_velocity: number;
  observed_boost: number | null;
  warning: string | null;
};

type Props = {
  currentEventId?: string | null;
  defaultWindowDays?: number;
  onApply: (boost: number, windowDays: number) => void;
};

export function ForecastBoostCalibrator({
  currentEventId,
  defaultWindowDays = 30,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [windowDays, setWindowDays] = useState<number>(defaultWindowDays);
  const [results, setResults] = useState<CalibrationRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["forecast-calibrator-candidates"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("sale_date, lot_id, event_ticket_lots!inner(zone_id, event_ticket_zones!inner(event_id, events!inner(id,name,date)))")
        .not("sale_date", "is", null)
        .limit(20000);
      if (error) throw error;
      const byEvent = new Map<string, { id: string; name: string; date: string | null; days: Set<string> }>();
      for (const row of (data ?? []) as any[]) {
        const ev = row?.event_ticket_lots?.event_ticket_zones?.events;
        if (!ev?.id) continue;
        const cur = byEvent.get(ev.id) ?? { id: ev.id, name: ev.name, date: ev.date, days: new Set<string>() };
        cur.days.add(row.sale_date);
        byEvent.set(ev.id, cur);
      }
      return Array.from(byEvent.values())
        .filter((e) => e.days.size >= 14 && e.id !== currentEventId)
        .map((e) => ({ id: e.id, name: e.name, date: e.date, distinctDays: e.days.size }))
        .sort((a, b) => b.distinctDays - a.distinctDays);
    },
  });

  useEffect(() => {
    if (!open) {
      setResults([]);
      setError(null);
      setSelectedIds([]);
    }
  }, [open]);

  function toggleId(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function runCalibration() {
    if (selectedIds.length === 0) return;
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      const rows = await Promise.all(selectedIds.map(async (id) => {
        const { data, error } = await supabase.rpc("calibrate_forecast_boost", {
          p_event_id: id,
          p_window_days: windowDays,
        });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data) as CalibrationRow;
      }));
      setResults(rows.filter(Boolean));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao calibrar");
    } finally {
      setRunning(false);
    }
  }

  const validResults = useMemo(
    () => results.filter((r) => typeof r.observed_boost === "number" && (r.observed_boost ?? 0) > 0),
    [results],
  );

  // Média ponderada por total_qty
  const aggregate = useMemo(() => {
    if (validResults.length === 0) return null;
    const totalWeight = validResults.reduce((s, r) => s + (r.total_qty || 0), 0);
    if (totalWeight <= 0) {
      const avg = validResults.reduce((s, r) => s + (r.observed_boost ?? 0), 0) / validResults.length;
      return { boost: avg, mode: "média simples" as const };
    }
    const weighted = validResults.reduce((s, r) => s + ((r.observed_boost ?? 0) * (r.total_qty || 0)), 0) / totalWeight;
    return { boost: weighted, mode: "ponderada por volume" as const };
  }, [validResults]);

  const canApply = !!aggregate && aggregate.boost > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="col-span-full md:col-span-1 gap-2">
          <Sparkles className="h-4 w-4" />
          Calibrar a partir de evento…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibrar boost da reta final</DialogTitle>
          <DialogDescription>
            Seleciona um ou mais eventos de referência. Com vários, é calculada a <strong>média ponderada por volume de vendas</strong>.
            <br />
            <span className="text-xs">
              Fórmula por evento: <code>boost = vel. últimos N dias ÷ vel. dias anteriores</code>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Eventos de referência ({selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"})</Label>
            <div className="rounded-md border max-h-60 overflow-y-auto divide-y">
              {isLoading && <div className="p-3 text-xs text-muted-foreground">A carregar…</div>}
              {!isLoading && (candidates ?? []).length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  Nenhum evento com pelo menos 14 dias de vendas datadas.
                </div>
              )}
              {(candidates ?? []).map((e) => {
                const checked = selectedIds.includes(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer text-sm">
                    <Checkbox checked={checked} onCheckedChange={() => toggleId(e.id)} />
                    <span className="flex-1 truncate">
                      {e.name} {e.date ? <span className="text-muted-foreground">· {e.date}</span> : ""}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{e.distinctDays}d</Badge>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Janela "reta final" (dias)</Label>
            <Input
              type="number"
              min={1}
              max={120}
              value={windowDays}
              onChange={(e) => setWindowDays(Math.max(1, Math.round(Number(e.target.value) || 30)))}
            />
          </div>

          <Button
            onClick={runCalibration}
            disabled={selectedIds.length === 0 || running}
            className="w-full gap-2"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Calcular boost {selectedIds.length > 1 ? `(${selectedIds.length} eventos)` : "observado"}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r) => {
                const ok = typeof r.observed_boost === "number" && (r.observed_boost ?? 0) > 0;
                return (
                  <div key={r.event_id} className="rounded-md border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold truncate">{r.event_name}</div>
                      <Badge variant={ok ? "default" : "outline"}>
                        {ok ? `${fmtNum(r.observed_boost ?? 0)}×` : "n/a"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <Cell label="Vendido" value={fmtInt(r.total_qty)} />
                      <Cell label="Vel. base" value={fmtNum(r.base_velocity)} />
                      <Cell label="Vel. final" value={fmtNum(r.final_velocity)} />
                    </div>
                    {!ok && r.warning && (
                      <p className="text-[11px] text-muted-foreground">{r.warning}</p>
                    )}
                  </div>
                );
              })}

              {aggregate && (
                <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      Boost {validResults.length > 1 ? `(${aggregate.mode})` : "observado"}:{" "}
                      <strong>{fmtNum(aggregate.boost)}×</strong>{" "}
                      ({fmtPct(aggregate.boost - 1)})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!canApply}
            onClick={() => {
              if (aggregate) {
                onApply(Number(aggregate.boost), windowDays);
                setOpen(false);
              }
            }}
          >
            Aplicar valor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{value}</div>
    </div>
  );
}

function fmtInt(n: number) { return new Intl.NumberFormat("pt-PT").format(Math.round(n)); }
function fmtNum(n: number) { return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n); }
function fmtPct(n: number) { return new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(n); }
