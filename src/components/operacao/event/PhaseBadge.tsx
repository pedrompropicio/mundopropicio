import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OperacaoPhase = "planning" | "montagem" | "evento" | "post" | null | undefined;

const META: Record<string, { label: string; cls: string }> = {
  planning: { label: "🎯 Planeamento", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  montagem: { label: "🔧 Montagem", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
  evento: { label: "🎤 Evento", cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50" },
  post: { label: "📦 Fecho", cls: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/40" },
  setup: { label: "⚙️ Setup", cls: "bg-muted text-muted-foreground border-border" },
};

export function PhaseBadge({ phase, className }: { phase: OperacaoPhase; className?: string }) {
  const m = META[phase ?? "setup"] ?? META.setup;
  return (
    <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-semibold border", m.cls, className)}>
      {m.label}
    </Badge>
  );
}

export const PHASE_ORDER: Array<{ key: "setup" | "planning" | "montagem" | "evento" | "post"; label: string }> = [
  { key: "setup", label: "SETUP" },
  { key: "planning", label: "PLANEAMENTO" },
  { key: "montagem", label: "MONTAGEM" },
  { key: "evento", label: "EVENTO" },
  { key: "post", label: "FECHO" },
];
