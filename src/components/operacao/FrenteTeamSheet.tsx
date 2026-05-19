import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, HardHat } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  frenteId: string;
  currentLeadId: string | null;
}

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function FrenteTeamSheet({ open, onClose, frenteId, currentLeadId }: Props) {
  const { data: team } = useQuery({
    queryKey: ["op-frente-team-full", frenteId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("profile_id, role_in_frente, is_permanent_lead, active, profiles:profile_id(id, full_name, profile_type)")
        .eq("frente_id", frenteId)
        .eq("active", true);
      return data ?? [];
    },
  });

  const groups: Record<string, any[]> = { lead: [], auxiliary: [], observer: [] };
  (team ?? []).forEach((m: any) => {
    (groups[m.role_in_frente] ?? groups.observer).push(m);
  });

  const labels: Record<string, string> = {
    lead: "Produtor",
    auxiliary: "Staff",
    observer: "Observers",
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Equipa da Zona/Serviço</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {(["lead", "auxiliary", "observer"] as const).map((g) =>
            groups[g].length === 0 ? null : (
              <div key={g}>
                <h3 className="text-xs uppercase text-muted-foreground mb-2">{labels[g]}</h3>
                <div className="space-y-1.5">
                  {groups[g].map((m: any) => (
                    <div key={m.profile_id} className="flex items-center gap-3 p-2 rounded border">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {initials(m.profiles?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          {m.profiles?.full_name ?? "—"}
                          {m.profiles?.profile_type === "field_staff" && (
                            <HardHat className="h-3 w-3 text-muted-foreground" />
                          )}
                          {m.profile_id === currentLeadId && (
                            <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />
                          )}
                        </p>
                      </div>
                      {m.is_permanent_lead && (
                        <Badge variant="outline" className="text-[10px]">permanente</Badge>
                      )}
                      {m.profile_id === currentLeadId && !m.is_permanent_lead && (
                        <Badge variant="default" className="text-[10px]">corrente</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}
          {(!team || team.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-6">Sem equipa atribuída.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
