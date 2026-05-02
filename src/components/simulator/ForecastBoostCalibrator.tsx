import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  /** Evento atual — excluído da lista de candidatos. */
  currentEventId?: string | null;
  /** Janela atualmente configurada (default 30). */
  defaultWindowDays?: number;
  /** Callback quando o utilizador aplica um valor calibrado. */
  onApply: (boost: number, windowDays: number) => void;
};

export function ForecastBoostCalibrator({
  currentEventId,
  defaultWindowDays = 30,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [refEventId, setRefEventId] = useState<string>("");
  const [windowDays, setWindowDays] = useState<number>(defaultWindowDays);
  const [result, setResult] = useState<CalibrationRow | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lista de eventos com vendas datadas (>= 14 dias distintos)
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
      setResult(null);
      setError(null);
    }
  }, [open]);

  async function runCalibration() {
    if (!refEventId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("calibrate_forecast_boost", {
        p_event_id: refEventId,
        p_window_days: windowDays,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setResult(row as CalibrationRow);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao calibrar");
    } finally {
      setRunning(false);
    }
  }

  const canApply = useMemo(
    () => !!result && typeof result.observed_boost === "number" && result.observed_boost > 0,
    [result],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="col-span-full md:col-span-1 gap-2">
          <Sparkles className="h-4 w-4" />
          Calibrar a partir de evento…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calibrar boost da reta final</DialogTitle>
          <DialogDescription>
            Calcula o multiplicador real a partir das vendas datadas de um evento de referência.
            <br />
            <span className="text-xs">
              Fórmula: <code>boost = velocidade média nos últimos N dias ÷ velocidade média nos dias anteriores</code>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Evento de referência</Label>
            <Select value={refEventId} onValueChange={setRefEventId}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "A carregar…" : "Escolhe um evento com vendas datadas"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(candidates ?? []).length === 0 && !isLoading && (
                  <div className="p-3 text-xs text-muted-foreground">
                    Nenhum evento com pelo menos 14 dias de vendas datadas.
                  </div>
                )}
                {(candidates ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} {e.date ? `· ${e.date}` : ""} · {e.distinctDays} dias com venda
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            disabled={!refEventId || running}
            className="w-full gap-2"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Calcular boost observado
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="rounded-md border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{result.event_name}</div>
                <Badge variant="outline">{result.event_date ?? "sem data"}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Cell label="Total vendido" value={fmtInt(result.total_qty)} />
                <Cell label="1ª venda" value={result.first_sale_date ?? "—"} />
                <Cell label="Última venda" value={result.last_sale_date ?? "—"} />
                <Cell label="Dias de venda base" value={String(result.base_window_days)} />
                <Cell label="Vel. base (qty/dia)" value={fmtNum(result.base_velocity)} />
                <Cell label="Vel. reta final (qty/dia)" value={fmtNum(result.final_velocity)} />
              </div>

              {canApply ? (
                <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      Boost observado: <strong>{fmtNum(result.observed_boost ?? 0)}×</strong>
                      {" "}({fmtPct((result.observed_boost ?? 1) - 1)})
                    </span>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {result.warning || "Sem dados suficientes para calcular boost. Tenta um evento com vendas antes e dentro da janela."}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!canApply}
            onClick={() => {
              if (result?.observed_boost) {
                onApply(Number(result.observed_boost), result.window_days);
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
    <div className="rounded bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function fmtInt(n: number) { return new Intl.NumberFormat("pt-PT").format(Math.round(n)); }
function fmtNum(n: number) { return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n); }
function fmtPct(n: number) { return new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(n); }
