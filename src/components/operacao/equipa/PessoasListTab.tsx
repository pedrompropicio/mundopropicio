import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserCog, HardHat } from "lucide-react";
import { NewPessoaMenu } from "./NewPessoaMenu";
import { PessoaSheet } from "./PessoaSheet";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Props {
  eventId: string | null;
}

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_type: string | null;
  archived_at: string | null;
  zoneCount: number;
  serviceCount: number;
};

export function PessoasListTab({ eventId }: Props) {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [showAllCompany, setShowAllCompany] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["equipa-pessoas-list", companyId, eventId, showAllCompany],
    enabled: !!companyId,
    queryFn: async (): Promise<Row[]> => {
      // Filtrar IDs envolvidos no evento (se aplicável)
      let restrictIds: Set<string> | null = null;
      if (eventId && !showAllCompany) {
        const [evtTeam, frenteTeam] = await Promise.all([
          supabase.from("event_team_members").select("profile_id").eq("event_id", eventId),
          supabase
            .from("operacao_frente_team")
            .select("profile_id, operacao_frentes!inner(event_id)")
            .eq("operacao_frentes.event_id", eventId),
        ]);
        const ids = new Set<string>();
        (evtTeam.data ?? []).forEach((r: any) => r.profile_id && ids.add(r.profile_id));
        (frenteTeam.data ?? []).forEach((r: any) => r.profile_id && ids.add(r.profile_id));
        restrictIds = ids;
      }

      let q = supabase
        .from("profiles")
        .select("id, full_name, email, phone, profile_type, archived_at")
        .eq("company_id", companyId!)
        .eq("is_operacao_only", true)
        .order("full_name", { ascending: true });
      if (restrictIds) {
        if (restrictIds.size === 0) return [];
        q = q.in("id", Array.from(restrictIds));
      }
      const { data: profiles, error } = await q;
      if (error) throw error;

      const ids = (profiles ?? []).map((p: any) => p.id);
      // Contagens — uma única query por todas as pessoas
      let teamRows: any[] = [];
      if (ids.length > 0) {
        const { data: tRows } = await supabase
          .from("operacao_frente_team")
          .select("profile_id, role_in_frente, operacao_frentes!inner(type, status)")
          .in("profile_id", ids)
          .eq("role_in_frente", "lead")
          .eq("active", true);
        teamRows = (tRows ?? []).filter(
          (r: any) => r.operacao_frentes?.status !== "cancelled",
        );
      }

      return (profiles ?? []).map((p: any) => {
        const mine = teamRows.filter((r) => r.profile_id === p.id);
        const zoneCount = mine.filter((r) => r.operacao_frentes?.type === "zone").length;
        const serviceCount = mine.filter((r) => r.operacao_frentes?.type === "service").length;
        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          profile_type: p.profile_type,
          archived_at: p.archived_at,
          zoneCount,
          serviceCount,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s) ||
        (r.phone ?? "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por nome, email, telefone…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {eventId && (
            <div className="flex items-center gap-2">
              <Switch
                id="show-all"
                checked={showAllCompany}
                onCheckedChange={setShowAllCompany}
              />
              <Label htmlFor="show-all" className="text-xs cursor-pointer">
                Toda a empresa
              </Label>
            </div>
          )}
        </div>
        <NewPessoaMenu onCreated={(id) => setSelectedId(id)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {search ? "Sem resultados." : "Sem pessoas cadastradas na Operação."}
        </Card>
      ) : (
        <div className="border rounded-md divide-y">
          {filtered.map((r) => {
            const isStaff = r.profile_type === "field_staff";
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 text-left transition-colors"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{r.full_name ?? "—"}</span>
                    <Badge variant={isStaff ? "secondary" : "default"} className="text-[10px]">
                      {isStaff ? (
                        <><HardHat className="h-2.5 w-2.5 mr-1" /> Staff</>
                      ) : (
                        <><UserCog className="h-2.5 w-2.5 mr-1" /> Produtor</>
                      )}
                    </Badge>
                    {r.archived_at && (
                      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                        Arquivado
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.email ?? ""}{r.email && r.phone ? " · " : ""}{r.phone ?? ""}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">
                  {r.zoneCount} zonas · {r.serviceCount} serviços
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PessoaSheet
        profileId={selectedId}
        eventId={eventId}
        companyId={companyId ?? ""}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
