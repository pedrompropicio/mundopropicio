import { cn } from "@/lib/utils";
import { type EventStatus, statusLabels } from "@/lib/mock-data";

const statusStyles: Record<EventStatus, string> = {
  planning: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", statusStyles[status])}>
      {statusLabels[status]}
    </span>
  );
}
