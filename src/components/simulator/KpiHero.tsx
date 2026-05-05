import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiHeroProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  subtext?: string;
  progress?: number;
  progressColor?: "blue" | "emerald" | "rose" | "amber";
  tone?: "positive" | "negative" | "neutral" | "muted";
}

const TONE_BG: Record<NonNullable<KpiHeroProps["tone"]>, string> = {
  positive: "bg-emerald-500/5 border-emerald-500/20",
  negative: "bg-rose-500/5 border-rose-500/20",
  neutral: "bg-muted/10 border-border",
  muted: "bg-transparent border-border/50",
};
const TONE_VAL: Record<NonNullable<KpiHeroProps["tone"]>, string> = {
  positive: "text-emerald-500",
  negative: "text-rose-500",
  neutral: "text-foreground",
  muted: "text-foreground",
};
const PROG_BG: Record<NonNullable<KpiHeroProps["progressColor"]>, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
};

export default function KpiHero({
  label, value, delta, deltaPositive, subtext, progress, progressColor = "blue", tone = "neutral",
}: KpiHeroProps) {
  return (
    <div className={`flex flex-col gap-1 p-4 rounded-xl border ${TONE_BG[tone]}`}>
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-bold tabular-nums leading-none ${TONE_VAL[tone]}`}
        style={{ fontSize: "clamp(20px, 2.5vw, 28px)" }}
      >
        {value}
      </span>
      {delta && (
        <span
          className={`flex items-center gap-1 text-xs font-semibold ${
            deltaPositive === undefined
              ? "text-muted-foreground"
              : deltaPositive
              ? "text-emerald-500"
              : "text-rose-500"
          }`}
        >
          {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta}
        </span>
      )}
      {subtext && <span className="text-[11px] text-muted-foreground">{subtext}</span>}
      {progress !== undefined && (
        <div className="mt-1 h-[3px] rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full ${PROG_BG[progressColor]}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
