import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { Crown, ChevronRight } from "lucide-react";
import { useMyLeadFrenteIds } from "@/hooks/useMyLeadFrenteIds";

type EtapaRow = any;

interface Bucket {
  key: "in_progress" | "pending" | "blocked" | "done_today";
  label: string;
  items: { etapa: EtapaRow; role: "owner" | "helper" | "responsible" | "via_frente" }[];
}

export default function MinhasTarefas() {
  const { user, hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_operacao");

  // 1. Frentes onde o user é lead (primário ou co-produtor) — via team
  const { leadFrenteIds } = useMyLeadFrenteIds();

  // 2. Etapas onde o user é assignee
  const { data: assigneeEtapas } = useQuery({
    queryKey: ["op-my-assignee-etapas", user?.id],
    enabled: !!user && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("etapa_id, role")
        .eq("profile_id", user!.id);
      return data ?? [];
    },
  });

  const etapaIdsFromAssignee = (assigneeEtapas ?? []).map((a: any) => a.etapa_id);

  // 3. Etapas relevantes — fazer 2 queries e merge
  const { data: etapas } = useQuery({
    queryKey: ["op-minhas-tarefas-etapas", user?.id, etapaIdsFromAssignee.join(","), (leadFrenteIds ?? []).join(",")],
    enabled: !!user && canView,
    queryFn: async () => {
      const results: any[] = [];
      // a) assignees / responsible
      const orFilter: string[] = [];
      if (etapaIdsFromAssignee.length > 0) orFilter.push(`id.in.(${etapaIdsFromAssignee.join(",")})`);
      orFilter.push(`responsible_profile_id.eq.${user!.id}`);
      const { data: d1 } = await supabase
        .from("operacao_etapas")
        .select("*, frente:operacao_frentes(id,name,color), supplier:suppliers(name)")
        .or(orFilter.join(","));
      results.push(...(d1 ?? []));
      // b) etapas das frentes onde sou lead
      if ((leadFrenteIds ?? []).length > 0) {
        const { data: d2 } = await supabase
          .from("operacao_etapas")
          .select("*, frente:operacao_frentes(id,name,color), supplier:suppliers(name)")
          .in("frente_id", leadFrenteIds!);
        results.push(...(d2 ?? []));
      }
      const seen = new Set<string>();
      return results.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
    },
  });

  // 4. Para "via_frente" só conta se etapa não tem assignees — precisamos saber quais têm
  const allIds = (etapas ?? []).map((e: any) => e.id);
  const { data: etapasComAssignees } = useQuery({
    queryKey: ["op-etapas-com-assignees", allIds.join(",")],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("etapa_id")
        .in("etapa_id", allIds);
      return new Set((data ?? []).map((a: any) => a.etapa_id));
    },
  });

  const buckets = useMemo<Bucket[]>(() => {
    const assigneeMap = new Map<string, "owner" | "helper">();
    (assigneeEtapas ?? []).forEach((a: any) => assigneeMap.set(a.etapa_id, a.role));
    const leadSet = new Set(leadFrenteIds ?? []);
    const withAssignees = etapasComAssignees ?? new Set<string>();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const list: { etapa: EtapaRow; role: Bucket["items"][number]["role"] }[] = [];
    for (const e of etapas ?? []) {
      let role: Bucket["items"][number]["role"] | null = null;
      if (assigneeMap.has(e.id)) role = assigneeMap.get(e.id)!;
      else if (e.responsible_profile_id === user?.id) role = "responsible";
      else if (leadSet.has(e.frente_id) && !withAssignees.has(e.id)) role = "via_frente";
      if (!role) continue;
      list.push({ etapa: e, role });
    }

    const b: Bucket[] = [
      { key: "in_progress", label: "Em curso", items: [] },
      { key: "pending", label: "Pendentes", items: [] },
      { key: "blocked", label: "Bloqueadas", items: [] },
      { key: "done_today", label: "Concluídas hoje", items: [] },
    ];
    for (const it of list) {
      if (it.etapa.status === "in_progress") b[0].items.push(it);
      else if (it.etapa.status === "pending") b[1].items.push(it);
      else if (it.etapa.status === "blocked") b[2].items.push(it);
      else if (
        it.etapa.status === "done" &&
        it.etapa.actual_end &&
        new Date(it.etapa.actual_end) >= todayStart
      ) b[3].items.push(it);
    }
    return b;
  }, [etapas, assigneeEtapas, leadFrenteIds, etapasComAssignees, user?.id]);

  if (!canView) return <div className="p-6">Sem permissão.</div>;

  const totalItems = buckets.reduce((acc, b) => acc + b.items.length, 0);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold">Minhas tarefas</h1>
        <p className="text-xs text-muted-foreground">Etapas onde és owner, helper ou responsável.</p>
      </header>

      {totalItems === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          Sem tarefas atribuídas a ti.
        </Card>
      )}

      {buckets.map((b) =>
        b.items.length === 0 ? null : (
          <section key={b.key} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{b.label} ({b.items.length})</h2>
            <div className="space-y-1.5">
              {b.items.map(({ etapa, role }) => (
                <Link key={etapa.id} to={`/operacao/etapa/${etapa.id}`}>
                  <Card className="p-3 flex items-center gap-3 active:scale-[0.99]">
                    <div
                      className="h-10 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: etapa.frente?.color ?? "#6b7280" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{etapa.name}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span className="truncate">{etapa.frente?.name}</span>
                        {etapa.supplier?.name && <span>· {etapa.supplier.name}</span>}
                      </div>
                    </div>
                    <RoleBadge role={role} />
                    <OperacaoStatusBadge status={etapa.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: "owner" | "helper" | "responsible" | "via_frente" }) {
  const map = {
    owner: { label: "Owner", icon: <Crown className="h-3 w-3 mr-1" />, variant: "default" as const },
    helper: { label: "Helper", icon: null, variant: "secondary" as const },
    responsible: { label: "Responsável", icon: null, variant: "outline" as const },
    via_frente: { label: "via Frente", icon: null, variant: "outline" as const },
  };
  const c = map[role];
  return (
    <Badge variant={c.variant} className="h-5 text-[10px] gap-0">
      {c.icon}{c.label}
    </Badge>
  );
}
