import { useDraggable } from "@dnd-kit/core";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, User as UserIcon } from "lucide-react";
import { isBefore } from "date-fns";

export interface KanbanEtapa {
  id: string;
  name: string;
  status: string;
  frente_id: string;
  frente_name?: string | null;
  frente_color?: string | null;
  supplier_name?: string | null;
  planned_end?: string | null;
  owner_name?: string | null;
}

interface Props {
  etapa: KanbanEtapa;
  disabled?: boolean;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function EtapaKanbanCard({ etapa, disabled }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: etapa.id,
    disabled,
  });

  const overdue =
    etapa.planned_end &&
    etapa.status !== "done" &&
    isBefore(new Date(etapa.planned_end), new Date());

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : {};

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={
        "p-3 space-y-2 cursor-grab active:cursor-grabbing " +
        (disabled ? "opacity-70 cursor-default" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/operacao/etapa/${etapa.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-medium leading-tight hover:underline line-clamp-2 flex-1"
        >
          {etapa.name}
        </Link>
        {overdue && (
          <span title="Em atraso" className="text-red-600 dark:text-red-400">
            <AlertOctagon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {etapa.frente_name && (
        <Badge
          variant="outline"
          className="text-[10px] gap-1 h-5"
          style={{ borderColor: etapa.frente_color ?? undefined }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: etapa.frente_color ?? "#6b7280" }}
          />
          {etapa.frente_name}
        </Badge>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{etapa.supplier_name ?? ""}</span>
        <span className="inline-flex items-center gap-1">
          <UserIcon className="h-3 w-3" />
          {initials(etapa.owner_name)}
        </span>
      </div>
    </Card>
  );
}
