import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssigneeLite {
  profile_id: string;
  full_name: string | null;
  role: "owner" | "helper";
}

interface Props {
  assignees: AssigneeLite[];
  inheritedFrom?: "responsible" | "frente_lead" | null;
  inheritedProfile?: { id: string; full_name: string | null } | null;
  size?: "sm" | "md";
  onClick?: () => void;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function EtapaAssigneeAvatars({
  assignees,
  inheritedFrom,
  inheritedProfile,
  size = "md",
  onClick,
}: Props) {
  const avatarSize = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  // Caso herdado (zero assignees)
  if (assignees.length === 0) {
    if (!inheritedProfile) {
      return (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Avatar className={cn(avatarSize, "opacity-50")}>
            <AvatarFallback>—</AvatarFallback>
          </Avatar>
          <span>Sem responsável</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5"
      >
        <Avatar className={cn(avatarSize, "opacity-60")}>
          <AvatarFallback>{initials(inheritedProfile.full_name)}</AvatarFallback>
        </Avatar>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {inheritedFrom === "responsible" ? "Responsável herdado" : "via Zona/Serviço"}
        </Badge>
      </button>
    );
  }

  const owners = assignees.filter((a) => a.role === "owner");
  const helpers = assignees.filter((a) => a.role === "helper");
  const ordered = [...owners, ...helpers];
  const shown = ordered.slice(0, 4);
  const extra = ordered.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center -space-x-1.5 hover:opacity-90"
    >
      {shown.map((a) => (
        <div key={a.profile_id} className="relative">
          <Avatar className={cn(avatarSize, "ring-2 ring-background")}>
            <AvatarFallback>{initials(a.full_name)}</AvatarFallback>
          </Avatar>
          {a.role === "owner" && (
            <Crown className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 fill-amber-500 drop-shadow" />
          )}
        </div>
      ))}
      {extra > 0 && (
        <Avatar className={cn(avatarSize, "ring-2 ring-background bg-muted")}>
          <AvatarFallback className="text-[10px]">+{extra}</AvatarFallback>
        </Avatar>
      )}
    </button>
  );
}
