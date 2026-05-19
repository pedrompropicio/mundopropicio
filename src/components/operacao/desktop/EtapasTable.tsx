import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, GripVertical, ExternalLink, Archive } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NewEtapaDialog } from "@/components/operacao/NewEtapaDialog";
import { EtapaSuppliersPanel } from "@/components/operacao/suppliers/EtapaSuppliersPanel";
import { EtapaInlineCell } from "./EtapaInlineCell";

const STATUS_OPTS = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em curso" },
  { value: "blocked", label: "Bloqueada" },
  { value: "done", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

interface Props {
  frenteId: string;
  companyId: string;
  canEdit: boolean;
}

function SuppliersCell({ etapaId, canEdit }: { etapaId: string; canEdit: boolean }) {
  const { data } = useQuery({
    queryKey: ["op-etapa-suppliers-cell", etapaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_suppliers")
        .select("id,role,supplier:suppliers(name)")
        .eq("etapa_id", etapaId);
      return data ?? [];
    },
  });
  const rows = (data ?? []) as any[];
  const principal = rows.find((r) => r.role === "principal");
  const extras = rows.length - (principal ? 1 : 0);
  const label = principal?.supplier?.name
    ? `${principal.supplier.name}${extras > 0 ? ` +${extras}` : ""}`
    : rows.length > 0
      ? `${rows.length} fornecedor${rows.length > 1 ? "es" : ""}`
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-xs text-left hover:underline truncate max-w-[140px]">
          {label ?? <span className="text-muted-foreground italic">— Adicionar</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <EtapaSuppliersPanel etapaId={etapaId} canEdit={canEdit} compact />
      </PopoverContent>
    </Popover>
  );
}

function Row({
  e, companyId, profiles, suppliers, zones, frenteIsService, canEdit, onUpdate, onArchive,
}: {
  e: any; companyId: string;
  profiles: { id: string; full_name: string | null }[];
  suppliers: { id: string; name: string }[];
  zones: { id: string; name: string }[];
  frenteIsService: boolean;
  canEdit: boolean;
  onUpdate: (id: string, patch: Record<string, any>) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className="border-b hover:bg-muted/30">
      <td className="px-2 py-1 w-8">
        <button {...attributes} {...listeners} disabled={!canEdit} className="cursor-grab disabled:opacity-30">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </td>
      <td className="px-2 py-1 min-w-[180px]">
        <EtapaInlineCell
          variant="text"
          value={e.name}
          disabled={!canEdit}
          onSave={(v) => onUpdate(e.id, { name: v ?? "" })}
        />
      </td>
      <td className="px-2 py-1 w-32">
        <EtapaInlineCell
          variant="select"
          value={e.status}
          disabled={!canEdit}
          options={STATUS_OPTS}
          onSave={(v) => onUpdate(e.id, { status: v ?? "pending" })}
        />
      </td>
      <td className="px-2 py-1 w-36">
        {frenteIsService ? (
          <Select
            value={e.zone_id ?? "__none__"}
            disabled={!canEdit}
            onValueChange={(v) => onUpdate(e.id, { zone_id: v === "__none__" ? null : v })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground italic px-1">—</span>
        )}
      </td>
      <td className="px-2 py-1 w-40">
        <SuppliersCell etapaId={e.id} canEdit={canEdit} />
      </td>
      <td className="px-2 py-1 w-40">
        <EtapaInlineCell
          variant="select"
          value={e.responsible_profile_id ?? ""}
          disabled={!canEdit}
          placeholder="—"
          options={[{ value: "", label: "—" }, ...profiles.map((p) => ({ value: p.id, label: p.full_name ?? "?" }))]}
          onSave={(v) => onUpdate(e.id, { responsible_profile_id: v || null })}
        />
      </td>
      <td className="px-2 py-1 w-32">
        <EtapaInlineCell
          variant="date"
          value={e.planned_start ?? ""}
          disabled={!canEdit}
          onSave={(v) => onUpdate(e.id, { planned_start: v || null })}
        />
      </td>
      <td className="px-2 py-1 w-32">
        <EtapaInlineCell
          variant="date"
          value={e.planned_end ?? ""}
          disabled={!canEdit}
          onSave={(v) => onUpdate(e.id, { planned_end: v || null })}
        />
      </td>
      <td className="px-2 py-1 w-20 text-right">
        <Button asChild size="icon" variant="ghost" className="h-7 w-7">
          <Link to={`/operacao/etapa/${e.id}`}><ExternalLink className="h-3 w-3" /></Link>
        </Button>
        {canEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onArchive(e.id)} title="Arquivar (cancelar)">
            <Archive className="h-3 w-3" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export function EtapasTable({ frenteId, companyId, canEdit }: Props) {
  const qc = useQueryClient();
  const [newEtapa, setNewEtapa] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const { data: frente } = useQuery({
    queryKey: ["op-etapas-table-frente", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,type,event_id")
        .eq("id", frenteId)
        .maybeSingle();
      return data;
    },
  });
  const frenteIsService = (frente as any)?.type === "service";

  const { data: zones } = useQuery({
    queryKey: ["op-etapas-table-zones", (frente as any)?.event_id],
    enabled: !!(frente as any)?.event_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name")
        .eq("event_id", (frente as any).event_id)
        .eq("type", "zone")
        .neq("status", "cancelled")
        .order("name");
      return data ?? [];
    },
  });

  const { data: etapas } = useQuery({
    queryKey: ["op-etapas-table", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name,status,supplier_id,responsible_profile_id,planned_start,planned_end,display_order,zone_id")
        .eq("frente_id", frenteId)
        .order("display_order");
      return data ?? [];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["op-suppliers-for-frente", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id,name").order("name").limit(500);
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["op-profiles-for-frente", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("id,full_name")
        .eq("company_id", companyId).is("archived_at", null).order("full_name");
      return data ?? [];
    },
  });

  const visible = useMemo(
    () => (etapas ?? []).filter((e: any) => showDone ? true : e.status !== "done"),
    [etapas, showDone],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const updateRow = async (id: string, patch: Record<string, any>) => {
    const { error } = await supabase.from("operacao_etapas").update(patch as any).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["op-etapas-table", frenteId] });
  };

  const archive = async (id: string) => {
    await updateRow(id, { status: "cancelled" });
  };

  const onDragEnd = async (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const list = (etapas ?? []).slice();
    const oldIdx = list.findIndex((x: any) => x.id === active.id);
    const newIdx = list.findIndex((x: any) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(list, oldIdx, newIdx);

    qc.setQueryData(["op-etapas-table", frenteId], reordered);

    const updates = reordered.map((r: any, i) =>
      supabase.from("operacao_etapas").update({ display_order: i }).eq("id", r.id),
    );
    await Promise.all(updates);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Etapas</h3>
          <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(!!v)} />
            Mostrar concluídas
          </label>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setNewEtapa(true)}>
            <Plus className="h-3 w-3 mr-1" /> Nova Etapa
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="w-8" />
              <th className="px-2 py-1.5 text-left">Nome</th>
              <th className="px-2 py-1.5 text-left">Status</th>
              <th className="px-2 py-1.5 text-left">Zona</th>
              <th className="px-2 py-1.5 text-left">Fornecedor</th>
              <th className="px-2 py-1.5 text-left">Responsável</th>
              <th className="px-2 py-1.5 text-left">Início prev.</th>
              <th className="px-2 py-1.5 text-left">Fim prev.</th>
              <th />
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map((e: any) => e.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-4">Sem etapas.</td></tr>
                )}
                {visible.map((e: any) => (
                  <Row
                    key={e.id}
                    e={e}
                    companyId={companyId}
                    profiles={profiles ?? []}
                    suppliers={suppliers ?? []}
                    zones={zones ?? []}
                    frenteIsService={frenteIsService}
                    canEdit={canEdit}
                    onUpdate={updateRow}
                    onArchive={archive}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      {newEtapa && (
        <NewEtapaDialog
          frenteId={frenteId}
          companyId={companyId}
          onClose={() => {
            setNewEtapa(false);
            qc.invalidateQueries({ queryKey: ["op-etapas-table", frenteId] });
          }}
        />
      )}
    </div>
  );
}
