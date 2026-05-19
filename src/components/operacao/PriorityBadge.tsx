import { cn } from "@/lib/utils";

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  crit: { bg: "bg-red-500", text: "text-white", label: "CRÍTICO" },
  high: { bg: "bg-orange-500", text: "text-white", label: "ALTO" },
  med: { bg: "bg-yellow-500", text: "text-black", label: "MÉDIO" },
  low: { bg: "bg-blue-500", text: "text-white", label: "BAIXO" },
};

export function PriorityBadge({
  priority,
  size = "compact",
  className,
}: {
  priority: string | null | undefined;
  size?: "compact" | "large";
  className?: string;
}) {
  const s = STYLES[priority ?? ""] ?? { bg: "bg-muted", text: "text-foreground", label: priority ?? "—" };
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-md",
        s.bg, s.text,
        size === "compact" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs uppercase tracking-wide",
        className,
      )}
    >
      {s.label}
    </span>
  );
}
