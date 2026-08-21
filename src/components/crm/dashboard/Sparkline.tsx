import { cn } from "@/lib/utils";

// ============================================================
// Sparkline (inline SVG, currentColor)
// ============================================================
export function Sparkline({
  data,
  width = 80,
  height = 20,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const trend = last >= first ? "text-emerald-500" : "text-red-500";
  return (
    <svg width={width} height={height} className={cn(trend, className)}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
