import { cn } from "@/lib/utils";
import { STAGE_BADGE_CLASSES, stageLabel, isEventStage } from "@/lib/event-stage";

export function EventStageBadge({ stage, title }: { stage: string | null | undefined; title?: string }) {
  if (!isEventStage(stage)) return null;
  return (
    <span
      title={title ?? "Estágio do evento"}
      className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", STAGE_BADGE_CLASSES[stage])}
    >
      {stageLabel(stage)}
    </span>
  );
}
