import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  variant?: "default" | "primary" | "accent" | "warning";
  forecast?: string;
  executionPercent?: number;
}

const variantStyles = {
  default: "border-border",
  primary: "border-primary/30 glow-primary",
  accent: "border-accent/30 glow-accent",
  warning: "border-warning/30",
};

const iconVariantStyles = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  warning: "bg-warning/15 text-warning",
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default", forecast, executionPercent }: StatCardProps) {
  return (
    <div className={cn("glass rounded-xl p-5 animate-fade-in", variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {forecast && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Previsto: <span className="font-medium text-foreground/70">{forecast}</span>
              </p>
              {executionPercent != null && (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        executionPercent >= 100 ? "bg-success" : executionPercent >= 50 ? "bg-primary" : "bg-warning"
                      )}
                      style={{ width: `${Math.min(executionPercent, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                    {executionPercent.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5 shrink-0", iconVariantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
