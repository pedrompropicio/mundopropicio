import React from "react";

type Scen = "real" | "breakeven" | "forecast";
interface Props {
  active: Scen;
  onChange: (s: Scen) => void;
}

const LABELS: Record<Scen, string> = { real: "Real", breakeven: "Break Even", forecast: "Forecast" };
const ACTIVE: Record<Scen, string> = {
  real: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  breakeven: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  forecast: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export default function ScenarioPill({ active, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border p-1 bg-background">
      {(["real", "breakeven", "forecast"] as Scen[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
            active === k
              ? ACTIVE[k]
              : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          {LABELS[k]}
        </button>
      ))}
    </div>
  );
}
