import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Scen = "real" | "breakeven" | "forecast";

export interface FinancialRow {
  label: string;
  indent?: boolean;
  values?: [number, number, number];
  delta?: number;
  deltaType?: "value" | "pct";
  tone?: "positive" | "negative" | "neutral";
  bold?: boolean;
  separator?: boolean;
  sectionHeader?: "revenue" | "cost" | "kpis";
}

interface Props {
  rows: FinancialRow[];
  active: Scen;
  formatFn: (v: number) => string;
}

const SECTION_COLORS: Record<NonNullable<FinancialRow["sectionHeader"]>, string> = {
  revenue: "text-blue-500",
  cost: "text-rose-500",
  kpis: "text-violet-500",
};

const SCEN_LABELS: Record<Scen, string> = { real: "Real", breakeven: "BE", forecast: "Forecast" };
const SCEN_KEYS: Scen[] = ["real", "breakeven", "forecast"];

export default function FinancialTable({ rows, active, formatFn }: Props) {
  const activeIdx = SCEN_KEYS.indexOf(active);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium w-[34%]">Linha</th>
                {SCEN_KEYS.map((k, i) => (
                  <th
                    key={k}
                    className={`text-right py-2 px-3 font-medium uppercase tracking-wide text-[10px] ${
                      i === activeIdx ? "text-primary" : ""
                    }`}
                  >
                    {SCEN_LABELS[k]}
                  </th>
                ))}
                <th className="text-right py-2 px-3 font-medium uppercase tracking-wide text-[10px]">
                  Δ Real→FC
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                if (r.sectionHeader) {
                  return (
                    <tr key={idx}>
                      <td
                        colSpan={5}
                        className={`pt-3 pb-1 px-3 text-[10px] uppercase tracking-wide font-bold ${SECTION_COLORS[r.sectionHeader]}`}
                      >
                        {r.label}
                      </td>
                    </tr>
                  );
                }
                const toneCls =
                  r.tone === "positive"
                    ? "text-emerald-500"
                    : r.tone === "negative"
                    ? "text-rose-500"
                    : "";
                const baseRow = `${r.separator ? "border-t" : ""} ${
                  r.bold ? "font-bold bg-muted/20" : ""
                }`;
                return (
                  <tr key={idx} className={baseRow}>
                    <td
                      className={`py-1.5 px-3 ${r.indent ? "pl-8" : ""} ${
                        r.bold ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {r.label}
                    </td>
                    {(r.values ?? [0, 0, 0]).map((v, j) => (
                      <td
                        key={j}
                        className={`py-1.5 px-3 text-right tabular-nums ${toneCls} ${
                          j === activeIdx ? "bg-primary/8 rounded-sm" : ""
                        }`}
                      >
                        {formatFn(v)}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      {r.delta !== undefined ? (
                        <span
                          className={
                            r.delta >= 0 ? "text-emerald-500" : "text-rose-500"
                          }
                        >
                          {r.deltaType === "pct"
                            ? `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)}%`
                            : `${r.delta >= 0 ? "+" : ""}${formatFn(r.delta)}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
