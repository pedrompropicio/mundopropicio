import { useDroppable } from "@dnd-kit/core";
import { EtapaKanbanCard, type KanbanEtapa } from "./EtapaKanbanCard";

interface Props {
  id: string;
  title: string;
  accent: string; // tailwind color e.g. "bg-yellow-500/10"
  etapas: KanbanEtapa[];
  canDrag: (etapa: KanbanEtapa) => boolean;
}

export function EtapaKanbanColumn({ id, title, accent, etapas, canDrag }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        "flex flex-col rounded-lg border " +
        (isOver ? "border-primary ring-1 ring-primary" : "border-border")
      }
    >
      <div className={"px-3 py-2 border-b text-xs font-semibold flex items-center justify-between " + accent}>
        <span>{title}</span>
        <span className="text-muted-foreground font-normal">{etapas.length}</span>
      </div>
      <div className="p-2 flex-1 min-h-[200px] space-y-2 bg-muted/20 rounded-b-lg">
        {etapas.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-6">Vazia</p>
        )}
        {etapas.map((e) => (
          <EtapaKanbanCard key={e.id} etapa={e} disabled={!canDrag(e)} />
        ))}
      </div>
    </div>
  );
}
