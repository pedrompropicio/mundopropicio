/**
 * DailyAttendanceCard — público por dia para os 3 cenários.
 *
 * Real: vem de `useEventAttendance` (ticket_sales reais, expandindo combos).
 * BE / Forecast: vêm dos totais diários já calculados pelo solver do Simulador
 * (props `beDailyTotals` / `fcDailyTotals`) — assim a tabela reflete o draft em
 * memória (sliders/boosts), tal como o KPI principal "Presenças × dia".
 */
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEventAttendance } from "@/hooks/useEventAttendance";

const fmtNum = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

type DailyTotalsRow = [number, { paying: number; courtesy: number; total: number; date: string | null }];

interface Props {
  eventId: string | undefined;
  /** Capacidade total por dia (soma das zonas) — opcional, para mostrar ocupação. */
  dailyCapacity?: number;
  /** Override BE: totais por dia vindos do solver (opcional). */
  beDailyTotals?: DailyTotalsRow[];
  /** Override Forecast: totais por dia vindos do solver (opcional). */
  fcDailyTotals?: DailyTotalsRow[];
  /** Se true, mostra detalhamento por zona (Pagantes / Cortesias / Total) com subtotais por dia. */
  byZone?: boolean;
}

export default function DailyAttendanceCard({ eventId, dailyCapacity, beDailyTotals, fcDailyTotals, byZone }: Props) {
  const real = useEventAttendance(eventId, "real");

  // Fallback: se o pai não passar overrides, mantém o comportamento antigo
  // (lê BE/Forecast como capacidade dos lotes).
  const beFallback = useEventAttendance(beDailyTotals ? undefined : eventId, "breakeven");
  const fcFallback = useEventAttendance(fcDailyTotals ? undefined : eventId, "forecast");

  // ── Modo "por zona" — replica a tabela do separador "Público diário" do Simulador ──
  if (byZone && eventId && real.dates.length > 0) {
    const fmtDate = (d: string | null) => {
      if (!d) return "—";
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return d;
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const s = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    const totalsByDay = new Map<number, { paying: number; courtesy: number; total: number; date: string | null }>();
    for (const c of real.cells) {
      const t = totalsByDay.get(c.day_index) ?? { paying: 0, courtesy: 0, total: 0, date: c.date };
      t.paying += c.paying; t.courtesy += c.courtesy; t.total += c.total;
      totalsByDay.set(c.day_index, t);
    }
    const grand = { paying: 0, courtesy: 0, total: 0 };
    for (const t of totalsByDay.values()) { grand.paying += t.paying; grand.courtesy += t.courtesy; grand.total += t.total; }
    const rows = real.cells.filter((c) => c.total > 0);

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Público diário por zona</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Pagantes + cortesias por zona × dia. Combos (1 ingresso = N dias) são expandidos em cada dia coberto.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Pagantes</TableHead>
                <TableHead className="text-right">Cortesias</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {real.dates.flatMap((d) => {
                const dayRows = rows.filter((r) => r.day_index === d.day_index);
                const sub = totalsByDay.get(d.day_index) ?? { paying: 0, courtesy: 0, total: 0, date: d.date };
                const out: React.ReactNode[] = dayRows.map((r) => (
                  <TableRow key={`r-${d.day_index}-${r.zone_id}`}>
                    <TableCell>{d.day_index + 1}</TableCell>
                    <TableCell>{fmtDate(d.date)}</TableCell>
                    <TableCell>{r.zone_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.paying)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.courtesy)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtNum(r.total)}</TableCell>
                  </TableRow>
                ));
                out.push(
                  <TableRow key={`t-${d.day_index}`} className="bg-muted/40 font-semibold border-b-2">
                    <TableCell>{d.day_index + 1}</TableCell>
                    <TableCell>{fmtDate(d.date)}</TableCell>
                    <TableCell>Subtotal Dia {d.day_index + 1}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(sub.paying)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(sub.courtesy)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(sub.total)}</TableCell>
                  </TableRow>,
                );
                return out;
              })}
              {real.dates.length > 1 && (
                <TableRow className="bg-primary/10 font-bold border-t-2">
                  <TableCell colSpan={3}>PRESENÇAS TOTAIS ({real.dates.length} dias · soma)</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(grand.paying)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(grand.courtesy)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(grand.total)}</TableCell>
                </TableRow>
              )}
              {!rows.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem vendas registadas.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (!eventId || real.dates.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Público por dia</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Sem datas de evento configuradas.</p>
        </CardContent>
      </Card>
    );
  }

  const beMap = new Map<number, number>();
  if (beDailyTotals) {
    for (const [idx, t] of beDailyTotals) beMap.set(idx, Number(t?.total || 0));
  }
  const fcMap = new Map<number, number>();
  if (fcDailyTotals) {
    for (const [idx, t] of fcDailyTotals) fcMap.set(idx, Number(t?.total || 0));
  }
  const beTotal = beDailyTotals
    ? Array.from(beMap.values()).reduce((a, b) => a + b, 0)
    : beFallback.grandTotal;
  const fcTotal = fcDailyTotals
    ? Array.from(fcMap.values()).reduce((a, b) => a + b, 0)
    : fcFallback.grandTotal;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Público por dia</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Presenças × dia (pagantes + cortesias). Combos (1 ingresso = N dias) são expandidos a cada dia.
          BE e Forecast refletem o draft do Simulador.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dia</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead className="text-right">Break Even</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              {dailyCapacity ? <TableHead className="text-right">Ocup. (Forecast)</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {real.dates.map((d) => {
              const r = real.totalsByDay[d.day_index] ?? 0;
              const b = beDailyTotals
                ? (beMap.get(d.day_index) ?? 0)
                : (beFallback.totalsByDay[d.day_index] ?? 0);
              const f = fcDailyTotals
                ? (fcMap.get(d.day_index) ?? 0)
                : (fcFallback.totalsByDay[d.day_index] ?? 0);
              const occ = dailyCapacity && dailyCapacity > 0 ? (f / dailyCapacity) * 100 : null;
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    {d.date ?? `Dia ${d.day_index + 1}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(b)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(f)}</TableCell>
                  {occ !== null ? (
                    <TableCell className="text-right">
                      <Badge variant={occ > 90 ? "destructive" : occ > 70 ? "default" : "outline"}>
                        {fmtPct(occ)}
                      </Badge>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            <TableRow className="font-bold border-t-2">
              <TableCell>Total ({real.dates.length} dias)</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(real.grandTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(beTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(fcTotal)}</TableCell>
              {dailyCapacity ? <TableCell /> : null}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
