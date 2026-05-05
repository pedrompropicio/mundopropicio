import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  label: string;
  current: number;
  currentLabel: string;
  beTarget: number;
  beLabel: string;
  fcTarget: number;
  fcLabel: string;
  formatFn?: (v: number) => string;
  footer?: string;
}

const defaultFmt = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });

function Bar({ value, max, color, label, valueLabel }: { value: number; max: number; color: string; label: string; valueLabel: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold">{valueLabel}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProgressKpi({
  label, current, currentLabel, beTarget, beLabel, fcTarget, fcLabel, formatFn = defaultFmt, footer,
}: Props) {
  const max = Math.max(current, beTarget, fcTarget, 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Bar value={current} max={max} color="bg-blue-500" label={currentLabel} valueLabel={formatFn(current)} />
        <Bar value={beTarget} max={max} color="bg-amber-500" label={beLabel} valueLabel={formatFn(beTarget)} />
        <Bar value={fcTarget} max={max} color="bg-emerald-500" label={fcLabel} valueLabel={formatFn(fcTarget)} />
        {footer && <p className="text-[11px] text-muted-foreground pt-1">{footer}</p>}
      </CardContent>
    </Card>
  );
}
