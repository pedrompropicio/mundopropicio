/**
 * DailyAttendanceCard — mostra público por dia (pagantes + cortesias) para os 3 cenários
 * usando a fonte canónica `useEventAttendance`. Garante que combos NÃO são contados em
 * duplicado (1 combo = 1 pessoa por dia, somado uma única vez no consolidado da turnê).
 */
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEventAttendance } from "@/hooks/useEventAttendance";

const fmtNum = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

interface Props {
  eventId: string | undefined;
  /** Capacidade total por dia (soma das zonas) — opcional, para mostrar ocupação. */
  dailyCapacity?: number;
}

export default function DailyAttendanceCard({ eventId, dailyCapacity }: Props) {
  const real = useEventAttendance(eventId, "real");
  const be = useEventAttendance(eventId, "breakeven");
  const fc = useEventAttendance(eventId, "forecast");

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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Público por dia</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Pagantes + cortesias por dia × cenário. Combos (1 ingresso = N dias) são expandidos a cada dia
          do evento sem dupla contagem.
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
              const b = be.totalsByDay[d.day_index] ?? 0;
              const f = fc.totalsByDay[d.day_index] ?? 0;
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
              <TableCell className="text-right tabular-nums">{fmtNum(be.grandTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(fc.grandTotal)}</TableCell>
              {dailyCapacity ? <TableCell /> : null}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
