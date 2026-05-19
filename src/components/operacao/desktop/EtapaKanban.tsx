import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { EtapaKanbanColumn } from "./EtapaKanbanColumn";
import type { KanbanEtapa } from "./EtapaKanbanCard";
import { toast } from "@/hooks/use-toast";

const COLUMNS = [
  { id: "pending", title: "Pendentes", accent: "bg-muted/40" },
  { id: "in_progress", title: "Em curso", accent: "bg-blue-500/10" },
  { id: "blocked", title: "Bloqueadas", accent: "bg-amber-500/10" },
  { id: "done", title: "Concluídas", accent: "bg-green-500/10" },
] as const;

export function EtapaKanban() {
  const { user, hasPermission, isAdmin } = useAuth();
  const { filters } = useOperacaoFilters();
  const qc = useQueryClient();
  const canManageAll = isAdmin || hasPermission("manage_operacao_etapas");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data: rows } = useQuery({
    queryKey: ["op-kanban-etapas", filters.event, filters.frentes.join(",")],
    enabled: !!filters.event,
    queryFn: async () => {
      let q = supabase
        .from("operacao_etapas")
        .select(
          "id,name,status,frente_id,supplier_id,planned_end,responsible_profile_id," +
            "frente:operacao_frentes!inner(id,name,color,event_id,current_lead_id)," +
            "supplier:suppliers(name)," +
            "owner:profiles!operacao_etapas_responsible_profile_id_fkey(full_name)",
        )
        .eq("frente.event_id", filters.event!);
      if (filters.frentes.length > 0) q = q.in("frente_id", filters.frentes);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const etapas: (KanbanEtapa & { current_lead_id: string | null })[] = useMemo(
    () =>
      (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        frente_id: r.frente_id,
        frente_name: r.frente?.name ?? null,
        frente_color: r.frente?.color ?? null,
        supplier_name: r.supplier?.name ?? null,
        planned_end: r.planned_end,
        owner_name: r.owner?.full_name ?? null,
        current_lead_id: r.frente?.current_lead_id ?? null,
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    if (filters.status.length === 0) return etapas;
    return etapas.filter((e) => filters.status.includes(e.status as any));
  }, [etapas, filters.status]);

  const byCol = useMemo(() => {
    const out: Record<string, typeof filtered> = {
      pending: [], in_progress: [], blocked: [], done: [],
    };
    filtered.forEach((e) => {
      if (out[e.status]) out[e.status].push(e);
    });
    return out;
  }, [filtered]);

  const canDrag = (e: typeof etapas[number]) =>
    canManageAll || e.current_lead_id === user?.id;

  const onDragEnd = async (ev: DragEndEvent) => {
    const id = ev.active.id as string;
    const newStatus = ev.over?.id as string | undefined;
    if (!newStatus || !COLUMNS.find((c) => c.id === newStatus)) return;
    const etapa = etapas.find((e) => e.id === id);
    if (!etapa || etapa.status === newStatus) return;
    if (!canDrag(etapa)) {
      toast({ title: "Sem permissão", description: "Não podes mover esta etapa.", variant: "destructive" });
      return;
    }

    // Optimistic
    qc.setQueryData(
      ["op-kanban-etapas", filters.event, filters.frentes.join(",")],
      (old: any[] | undefined) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
    );

    const { error } = await supabase
      .from("operacao_etapas")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["op-kanban-etapas"] });
    } else {
      toast({ title: "Etapa atualizada" });
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((c) => (
          <EtapaKanbanColumn
            key={c.id}
            id={c.id}
            title={c.title}
            accent={c.accent}
            etapas={byCol[c.id] ?? []}
            canDrag={canDrag}
          />
        ))}
      </div>
    </DndContext>
  );
}
