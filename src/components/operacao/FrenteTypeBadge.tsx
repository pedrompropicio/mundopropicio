import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FrenteTypeBadge({ type, className }: { type?: string | null; className?: string }) {
  if (!type || (type !== "zone" && type !== "service")) return null;
  const isZone = type === "zone";
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4 px-1.5 text-[9px] font-semibold uppercase tracking-wide border-current",
        isZone
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
          : "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/40",
        className,
      )}
    >
      {isZone ? "Zona" : "Serviço"}
    </Badge>
  );
}
