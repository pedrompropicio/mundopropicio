import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FrenteLeadLite {
  profile_id: string;
  full_name: string | null;
}

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/**
 * Avatares empilhados dos produtores (leads) de uma frente.
 * O primário (currentLeadId) aparece primeiro, com coroa.
 * Até `max` visíveis; restantes ficam como "+N".
 */
export function FrenteLeadsAvatars({
  leads,
  currentLeadId,
  max = 3,
  size = "sm",
  className,
}: {
  leads: FrenteLeadLite[];
  currentLeadId?: string | null;
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sorted = [...leads].sort((a, b) => {
    if (a.profile_id === currentLeadId) return -1;
    if (b.profile_id === currentLeadId) return 1;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  const visible = sorted.slice(0, max);
  const extra = sorted.length - visible.length;
  const sizeCls = size === "xs" ? "h-5 w-5 text-[9px]" : size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";

  if (sorted.length === 0) return null;

  const title = sorted.map((l) => l.full_name ?? "—").join(", ");

  return (
    <div className={cn("flex items-center -space-x-1.5", className)} title={title}>
      {visible.map((l) => {
        const isPrimary = l.profile_id === currentLeadId;
        return (
          <div key={l.profile_id} className="relative">
            <Avatar className={cn(sizeCls, "border-2 border-background", isPrimary && "ring-1 ring-amber-500")}>
              <AvatarFallback className={cn("font-medium", isPrimary && "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
                {initials(l.full_name)}
              </AvatarFallback>
            </Avatar>
            {isPrimary && (
              <Crown className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-500 fill-amber-500" />
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <span className={cn(sizeCls, "rounded-full bg-muted border-2 border-background inline-flex items-center justify-center font-medium text-muted-foreground")}>
          +{extra}
        </span>
      )}
    </div>
  );
}
