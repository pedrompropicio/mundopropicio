import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number | string;
  subLabel?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "amber" | "red" | "green" | "blue" | "purple";
}

const TONE_BG: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-card",
  amber: "bg-amber-500/10 border-amber-500/30",
  red: "bg-red-500/10 border-red-500/30",
  green: "bg-green-500/10 border-green-500/30",
  blue: "bg-blue-500/10 border-blue-500/30",
};

export function KpiCard({ label, value, subLabel, icon: Icon, tone = "default" }: Props) {
  return (
    <Card className={cn("p-4 flex flex-col gap-1", TONE_BG[tone])}>
      <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wide">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4" />}
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {subLabel && <div className="text-xs text-muted-foreground">{subLabel}</div>}
    </Card>
  );
}
