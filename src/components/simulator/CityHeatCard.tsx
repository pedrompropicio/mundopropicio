import React from "react";

interface Props {
  name: string;
  publico: number;
  ticketMedio: number;
  abPerPerson: number;
  receita: number;
  custo: number;
  resultado: number;
  margem: number;
  breakEvenQty: number;
  formatFn: (v: number) => string;
  fmtNum: (v: number) => string;
}

function tone(margem: number) {
  if (margem >= 30)
    return {
      bg: "bg-emerald-500/8 border-emerald-500/20",
      pill: "bg-emerald-500/15 text-emerald-500",
    };
  if (margem >= 10)
    return { bg: "bg-blue-500/8 border-blue-500/20", pill: "bg-blue-500/15 text-blue-500" };
  if (margem >= 0)
    return { bg: "bg-amber-500/8 border-amber-500/20", pill: "bg-amber-500/15 text-amber-500" };
  return { bg: "bg-rose-500/8 border-rose-500/20", pill: "bg-rose-500/15 text-rose-500" };
}

export default function CityHeatCard(p: Props) {
  const t = tone(p.margem);
  const beShort = p.breakEvenQty > p.publico;
  return (
    <div className={`rounded-xl border p-4 ${t.bg} flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-sm text-foreground">{p.name}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${t.pill}`}>
          {p.margem.toFixed(1)}%
        </span>
      </div>
      <div>
        <div className="font-mono font-bold tabular-nums text-foreground" style={{ fontSize: 22 }}>
          {p.fmtNum(p.publico)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          pessoas · forecast
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Receita</span>
        <span className="text-right tabular-nums">{p.formatFn(p.receita)}</span>
        <span className="text-muted-foreground">Custo</span>
        <span className="text-right tabular-nums">{p.formatFn(p.custo)}</span>
        <span className="text-muted-foreground font-semibold">Resultado</span>
        <span
          className={`text-right tabular-nums font-semibold ${
            p.resultado >= 0 ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {p.formatFn(p.resultado)}
        </span>
      </div>
      <div
        className={`text-[10px] pt-1 border-t border-border/40 ${
          beShort ? "text-amber-500" : "text-muted-foreground"
        }`}
      >
        BE: {p.fmtNum(p.breakEvenQty)} pessoas · TM {p.formatFn(p.ticketMedio)} · A&B/pp{" "}
        {p.formatFn(p.abPerPerson)}
      </div>
    </div>
  );
}
