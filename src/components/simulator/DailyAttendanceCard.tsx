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
}

export default function DailyAttendanceCard({ eventId, dailyCapacity, beDailyTotals, fcDailyTotals }: Props) {
  const real = useEventAttendance(eventId, "real");

  // Fallback: se o pai não passar overrides, mantém o comportamento antigo
  // (lê BE/Forecast como capacidade dos lotes).
  const beFallback = useEventAttendance(beDailyTotals ? undefined : eventId, "breakeven");
  const fcFallback = useEventAttendance(fcDailyTotals ? undefined : eventId, "forecast");

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
