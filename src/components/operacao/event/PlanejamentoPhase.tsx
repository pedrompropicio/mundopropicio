import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { NewEtapaDialog } from "@/components/operacao/NewEtapaDialog";
import { EditFrenteSheet } from "@/components/operacao/event/EditFrenteSheet";
import { MapPin, Wrench, Plus, ChevronRight, MoreVertical, Pencil, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { frenteLabel } from "@/lib/operacao-labels";

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pendente" },
  { key: "in_progress", label: "Em curso" },
  { key: "blocked", label: "Bloqueada" },
  { key: "done", label: "Concluída" },
  { key: "cancelled", label: "Cancelada" },
];

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function fmtPlanned(start?: string | null, end?: string | null): string {
  if (!start && !end) return "";
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const s = start ? new Date(start).toLocaleDateString("pt-PT", opts) : "?";
  const e = end ? new Date(end).toLocaleDateString("pt-PT", opts) : "?";
  if (start && end && start === end) return s;
  return `${s} → ${e}`;
}

export function PlanejamentoPhase({
  eventId, companyId, canManage, onBackToSetup,
}: { eventId: string; companyId: string; canManage: boolean; onBackToSetup: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(["pending", "in_progress", "blocked"]));
  const [addEtapaFor, setAddEtapaFor] = useState<string | null>(null);
  const [editFrenteId, setEditFrenteId] = useState<string | null>(null);

  const { data: frentes, isLoading } = useQuery({
    queryKey: ["op-hub-planning", "frentes", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,type,current_lead_id, lead:profiles!operacao_frentes_current_lead_id_fkey(full_name)")
        .eq("event_id", eventId).neq("status", "cancelled")
        .order("type", { ascending: false })
        .order("display_order");
      return data ?? [];
    },
  });

  const frenteIds = useMemo(() => (frentes ?? []).map((f: any) => f.id), [frentes]);

  const { data: etapas } = useQuery({
    queryKey: ["op-hub-planning", "etapas", frenteIds.join(",")],
    enabled: frenteIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name,status,frente_id,planned_start,planned_end,has_no_date,display_order")
        .in("frente_id", frenteIds)
        .order("display_order", { ascending: true })
        .order("planned_start", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  const zonas = (frentes ?? []).filter((f: any) => f.type === "zone");
  const servicos = (frentes ?? []).filter((f: any) => f.type === "service");
  const others = (frentes ?? []).filter((f: any) => f.type !== "zone" && f.type !== "service");

  const toggleStatus = (k: string) => {
    setStatusSel((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const filterEtapas = (frenteId: string) =>
    (etapas ?? []).filter((e: any) => e.frente_id === frenteId && statusSel.has(e.status));

  const allEtapasForFrente = (frenteId: string) =>
    (etapas ?? []).filter((e: any) => e.frente_id === frenteId);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">A carregar…</p>;

  if ((frentes ?? []).length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Não há Zonas nem Serviços. Volta à fase Setup para configurar.</p>
        <Button variant="outline" size="sm" onClick={onBackToSetup}>← Voltar a Setup</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        {STATUS_FILTERS.map((f) => {
          const on = statusSel.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleStatus(f.key)}
              className={cn(
                "px-2 py-1 rounded-full text-[11px] border transition-colors",
                on ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {zonas.length > 0 && (
        <Section
          title="Zonas físicas"
          icon={MapPin}
          frentes={zonas}
          renderEtapas={filterEtapas}
          totalCount={allEtapasForFrente}
          onAddEtapa={(id) => setAddEtapaFor(id)}
          onEditFrente={(id) => setEditFrenteId(id)}
          canManage={canManage}
          onOpenEtapa={(id) => navigate(`/operacao/etapa/${id}`)}
        />
      )}

      {servicos.length > 0 && (
        <Section
          title="Serviços transversais"
          icon={Wrench}
          frentes={servicos}
          renderEtapas={filterEtapas}
          totalCount={allEtapasForFrente}
          onAddEtapa={(id) => setAddEtapaFor(id)}
          onEditFrente={(id) => setEditFrenteId(id)}
          canManage={canManage}
          onOpenEtapa={(id) => navigate(`/operacao/etapa/${id}`)}
        />
      )}

      {others.length > 0 && (
        <Section
          title="Outras"
          icon={Settings}
          frentes={others}
          renderEtapas={filterEtapas}
          totalCount={allEtapasForFrente}
          onAddEtapa={(id) => setAddEtapaFor(id)}
          onEditFrente={(id) => setEditFrenteId(id)}
          canManage={canManage}
          onOpenEtapa={(id) => navigate(`/operacao/etapa/${id}`)}
        />
      )}

      {addEtapaFor && (
        <NewEtapaDialog
          frenteId={addEtapaFor}
          companyId={companyId}
          onClose={() => {
            setAddEtapaFor(null);
            qc.invalidateQueries({ queryKey: ["op-hub-planning"] });
          }}
        />
      )}

      <EditFrenteSheet
        frenteId={editFrenteId}
        open={!!editFrenteId}
        onClose={() => setEditFrenteId(null)}
      />
    </div>
  );
}

function Section({
  title, icon: Icon, frentes, renderEtapas, totalCount, onAddEtapa, onEditFrente, canManage, onOpenEtapa,
}: {
  title: string;
  icon: any;
  frentes: any[];
  renderEtapas: (id: string) => any[];
  totalCount: (id: string) => any[];
  onAddEtapa: (id: string) => void;
  onEditFrente: (id: string) => void;
  canManage: boolean;
  onOpenEtapa: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (

    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" /> {title}
      </h2>
      <div className="space-y-3">
        {frentes.map((f: any) => {
          const visible = renderEtapas(f.id);
          const total = totalCount(f.id).length;
          const hiddenByFilter = total - visible.length;
          return (
            <Card key={f.id} className="overflow-hidden glass">
              <div className="flex items-center gap-3 p-3 border-b bg-muted/20">
                <button
                  type="button"
                  onClick={() => navigate(`/operacao/frente/${f.id}`)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: f.color ?? "#6b7280" }} />
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px]">{initials(f.lead?.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {f.lead?.full_name ? `Produtor: ${f.lead.full_name}` : "Sem produtor"} · {total} etapas
                    </p>
                  </div>
                </button>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditFrente(f.id)}>
                        <Pencil className="h-3 w-3 mr-2" /> Editar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className="divide-y">
                {total === 0 && (
                  <button
                    onClick={() => canManage && onAddEtapa(f.id)}
                    disabled={!canManage}
                    className="w-full text-left p-3 text-xs text-muted-foreground italic hover:bg-muted/40 disabled:opacity-50"
                  >
                    Sem etapas. {canManage ? "+ Adicionar a primeira." : ""}
                  </button>
                )}
                {visible.map((e: any) => (
                  <button
                    key={e.id}
                    onClick={() => onOpenEtapa(e.id)}
                    className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/40 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{e.name}</p>
                      {!e.has_no_date && (e.planned_start || e.planned_end) && (
                        <p className="text-[11px] text-muted-foreground">{fmtPlanned(e.planned_start, e.planned_end)}</p>
                      )}
                    </div>
                    <OperacaoStatusBadge status={e.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
                {hiddenByFilter > 0 && (
                  <p className="px-3 py-1.5 text-[11px] text-muted-foreground italic">
                    {hiddenByFilter} etapa(s) ocultas pelos filtros
                  </p>
                )}
                {canManage && total > 0 && (
                  <button
                    onClick={() => onAddEtapa(f.id)}
                    className="w-full p-2 text-xs text-primary hover:bg-muted/40 flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Adicionar etapa
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
