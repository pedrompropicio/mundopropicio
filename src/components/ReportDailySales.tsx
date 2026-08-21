/**
 * Relatório "Vendas Diárias" — vendas de bilheteira dia a dia por evento.
 *
 * Dataset único via RPC `get_daily_sales_series` (mesma lógica das RPCs
 * get_sales_position / get_sales_position_by_provider): eventos BOL usam a
 * série `bol_daily_sales`, os restantes agregam `ticket_sales` por `sale_date`
 * (ligação ao evento sempre via zone_id → event_ticket_zones.event_id).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { exportDailySalesPdf } from "@/lib/export-daily-sales";

type PeriodPreset = "yesterday" | "7d" | "30d" | "custom";

const PROVIDERS = ["Ticketline", "BOL", "Fever", "Outras"] as const;

const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const int = (v: number) => nfInt.format(Number(v || 0));

const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

interface SeriesRow {
  group_id: string;
  event_name: string;
  event_date: string | null;
  sale_date: string;
  provider: string;
  qty: number;
  value: number;
}

function resolveRange(preset: PeriodPreset, custom: { from?: Date; to?: Date }) {
  const today = new Date();
  if (preset === "yesterday") {
    const y = addDays(today, -1);
    return { start: toISO(y), end: toISO(y) };
  }
  if (preset === "7d") return { start: toISO(addDays(today, -7)), end: toISO(addDays(today, -1)) };
  if (preset === "30d") return { start: toISO(addDays(today, -30)), end: toISO(addDays(today, -1)) };
  const from = custom.from ?? addDays(today, -7);
  const to = custom.to ?? from;
  return { start: toISO(from), end: toISO(to) };
}

export default function ReportDailySales() {
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const [allEvents, setAllEvents] = useState(true);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("all");
  const [breakdown, setBreakdown] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { start, end } = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  /** Eventos ativos agrupados pelo pai — mesma regra do widget Posição de Vendas. */
  const { data: eventOptions = [] } = useQuery({
    queryKey: ["daily-sales-event-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, parent_event_id, management_type");
      if (error) throw error;
      const rows = (data ?? []).filter((e: any) => (e.management_type ?? "own") === "own");
      const groups = new Map<string, { id: string; name: string; date: string | null; active: boolean }>();
      for (const e of rows as any[]) {
        const gid = e.parent_event_id ?? e.id;
        const active =
          !["cancelled", "completed", "archived"].includes(String(e.status ?? ""));
        const prev = groups.get(gid);
        const isParent = e.id === gid;
        groups.set(gid, {
          id: gid,
          name: isParent || !prev ? e.name : prev.name,
          date: prev?.date && e.date ? (e.date < prev.date ? e.date : prev.date) : (e.date ?? prev?.date ?? null),
          active: (prev?.active ?? false) || active,
        });
      }
      return Array.from(groups.values())
        .filter((g) => g.active)
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
    },
  });

  const eventIdsParam = allEvents
    ? (eventOptions.length ? eventOptions.map((e) => e.id) : null)
    : selectedEventIds;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["daily-sales-series", start, end, provider, eventIdsParam],
    enabled: allEvents ? eventOptions.length > 0 : selectedEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_sales_series" as any, {
        p_start: start,
        p_end: end,
        p_event_ids: eventIdsParam,
        p_provider: provider === "all" ? null : provider,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        qty: Number(r.qty || 0),
        value: Number(r.value || 0),
      })) as SeriesRow[];
    },
  });

  const showBreakdown = provider === "all" && breakdown;

  const grouped = useMemo(() => {
    const map = new Map<string, {
      group_id: string;
      event_name: string;
      event_date: string | null;
      days: Map<string, { qty: number; value: number; byProvider: Record<string, { qty: number; value: number }> }>;
      totalQty: number;
      totalValue: number;
    }>();
    for (const r of rows) {
      let g = map.get(r.group_id);
      if (!g) {
        g = { group_id: r.group_id, event_name: r.event_name, event_date: r.event_date, days: new Map(), totalQty: 0, totalValue: 0 };
        map.set(r.group_id, g);
      }
      let d = g.days.get(r.sale_date);
      if (!d) {
        d = { qty: 0, value: 0, byProvider: {} };
        g.days.set(r.sale_date, d);
      }
      d.qty += r.qty;
      d.value += r.value;
      const p = d.byProvider[r.provider] ?? { qty: 0, value: 0 };
      p.qty += r.qty;
      p.value += r.value;
      d.byProvider[r.provider] = p;
      g.totalQty += r.qty;
      g.totalValue += r.value;
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        dayList: Array.from(g.days.entries())
          .map(([sale_date, v]) => ({ sale_date, ...v }))
          .sort((a, b) => a.sale_date.localeCompare(b.sale_date)),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [rows]);

  const activeProviders = useMemo(() => {
    if (!showBreakdown) return [] as string[];
    const set = new Set(rows.map((r) => r.provider));
    return PROVIDERS.filter((p) => set.has(p)) as unknown as string[];
  }, [rows, showBreakdown]);

  const consolidated = grouped.map((g) => ({ event_name: g.event_name, qty: g.totalQty, value: g.totalValue }));
  const grandQty = consolidated.reduce((a, s) => a + s.qty, 0);
  const grandValue = consolidated.reduce((a, s) => a + s.value, 0);

  const periodLabel =
    preset === "yesterday" ? `Ontem (${fmtDay(start)})`
    : `${fmtDay(start)} — ${fmtDay(end)}`;
  const providerLabel = provider === "all" ? "Todas" : provider;
  const eventsLabel = allEvents
    ? "Todos os eventos ativos"
    : eventOptions.filter((e) => selectedEventIds.includes(e.id)).map((e) => e.name).join(", ") || "—";

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDailySalesPdf({
        periodLabel,
        providerLabel,
        eventsLabel,
        providers: activeProviders,
        summary: consolidated,
        events: grouped.map((g) => ({
          event_name: g.event_name,
          event_date: g.event_date,
          totalQty: g.totalQty,
          totalValue: g.totalValue,
          days: g.dayList.map((d) => ({
            sale_date: d.sale_date,
            qty: d.qty,
            value: d.value,
            byProvider: showBreakdown ? d.byProvider : undefined,
          })),
        })),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar PDF");
    } finally {
      setExporting(false);
    }
  };

  const toggleEvent = (id: string) =>
    setSelectedEventIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {([
            { k: "yesterday", l: "Ontem" },
            { k: "7d", l: "Últimos 7 dias" },
            { k: "30d", l: "Últimos 30 dias" },
          ] as const).map((p) => (
            <Button
              key={p.k}
              size="sm"
              variant={preset === p.k ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setPreset(p.k)}
            >
              {p.l}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={preset === "custom" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setPreset("custom")}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                {preset === "custom" ? `${fmtDay(start)} — ${fmtDay(end)}` : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={custom.from ? { from: custom.from, to: custom.to ?? custom.from } : undefined}
                onSelect={(range: any) => {
                  setPreset("custom");
                  setCustom({ from: range?.from, to: range?.to ?? range?.from });
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={allEvents ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setAllEvents(true)}
          >
            Todos os eventos ativos
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={!allEvents ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setAllEvents(false)}
              >
                Eventos específicos{!allEvents && selectedEventIds.length ? ` (${selectedEventIds.length})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <ScrollArea className="h-72">
                <div className="p-2 space-y-1.5">
                  {eventOptions.map((e) => (
                    <label key={e.id} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50 cursor-pointer">
                      <Checkbox
                        checked={selectedEventIds.includes(e.id)}
                        onCheckedChange={() => { setAllEvents(false); toggleEvent(e.id); }}
                      />
                      <span className="text-xs leading-tight">
                        {e.name}
                        {e.date ? <span className="text-muted-foreground"> · {fmtDay(e.date)}</span> : null}
                      </span>
                    </label>
                  ))}
                  {eventOptions.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">Sem eventos ativos.</div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>

        <div className="h-6 w-px bg-border" />

        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as bilheteiras</SelectItem>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {provider === "all" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={breakdown} onCheckedChange={(v) => setBreakdown(!!v)} />
            <Label className="text-xs cursor-pointer">Decompor por bilheteira</Label>
          </label>
        )}

        <div className="ml-auto">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExport} disabled={exporting || isLoading}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            Exportar PDF
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> A carregar vendas…
        </div>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem vendas no período selecionado.
        </Card>
      ) : (
        <>
          {/* Resumo consolidado */}
          {grouped.length > 1 && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">Resumo consolidado — {periodLabel}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="text-left py-1.5">Evento</th>
                      <th className="text-right py-1.5">Bilhetes</th>
                      <th className="text-right py-1.5">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidated.map((s) => (
                      <tr key={s.event_name} className="border-b last:border-0">
                        <td className="py-1.5">{s.event_name}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{int(s.qty)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{money(s.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-1.5">TOTAL</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{int(grandQty)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{money(grandValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* Secção por evento */}
          {grouped.map((g) => (
            <Card key={g.group_id} className="p-4">
              <div className="mb-2">
                <div className="text-sm font-semibold">{g.event_name}</div>
                {g.event_date && (
                  <div className="text-xs text-muted-foreground">{fmtDay(g.event_date)}</div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="text-left py-1.5">Dia</th>
                      {activeProviders.map((p) => (
                        <th key={p} className="text-right py-1.5 whitespace-nowrap">{p}</th>
                      ))}
                      <th className="text-right py-1.5">Bilhetes</th>
                      <th className="text-right py-1.5">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.dayList.map((d) => (
                      <tr key={d.sale_date} className="border-b last:border-0">
                        <td className="py-1.5 whitespace-nowrap">{fmtDay(d.sale_date)}</td>
                        {activeProviders.map((p) => {
                          const cell = d.byProvider[p];
                          return (
                            <td key={p} className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                              {cell ? (
                                <span>
                                  {int(cell.qty)}
                                  <span className="text-muted-foreground"> · {money(cell.value)}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-1.5 text-right font-mono tabular-nums">{int(d.qty)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{money(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-1.5">TOTAL</td>
                      {activeProviders.map((p) => {
                        const q = g.dayList.reduce((a, d) => a + (d.byProvider[p]?.qty ?? 0), 0);
                        const v = g.dayList.reduce((a, d) => a + (d.byProvider[p]?.value ?? 0), 0);
                        return (
                          <td key={p} className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {int(q)}<span className="text-muted-foreground"> · {money(v)}</span>
                          </td>
                        );
                      })}
                      <td className="py-1.5 text-right font-mono tabular-nums">{int(g.totalQty)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{money(g.totalValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
