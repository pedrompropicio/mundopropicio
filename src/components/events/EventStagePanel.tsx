import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleAlert, Lock, LockOpen, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { EventStageBadge } from "./EventStageBadge";
import { useEventCloseChecklist, useEventStageAction } from "@/hooks/useEventStages";
import { mapStageError, stageActions, type EventStage } from "@/lib/event-stage";

type Action = "close" | "reopen" | "mark" | "unmark";

const DIALOG: Record<Action, { title: string; desc: string; confirm: string; reason: "optional" | "required" | "none" }> = {
  close: { title: "Fechar evento", desc: "Grava o carimbo de fecho. O estado do evento não muda.", confirm: "Fechar evento", reason: "optional" },
  reopen: { title: "Reabrir fecho", desc: "Remove o carimbo de fecho. O motivo é obrigatório e fica auditado.", confirm: "Reabrir fecho", reason: "required" },
  mark: { title: "Marcar como histórico", desc: "O evento deixa de aparecer na lista por defeito.", confirm: "Marcar como histórico", reason: "optional" },
  unmark: { title: "Remover de histórico", desc: "O evento volta a aparecer na lista por defeito.", confirm: "Remover de histórico", reason: "none" },
};

export function EventStagePanel(props: {
  eventId: string;
  stage: EventStage | null | undefined;
  parentEventId: string | null | undefined;
  parentName?: string | null;
  isAdmin: boolean;
  isManager: boolean;
}) {
  const isSub = !!props.parentEventId;
  const { data: checklist, isLoading } = useEventCloseChecklist(props.eventId, !isSub && !!props.stage);
  const mutation = useEventStageAction(props.eventId);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");

  if (isSub) {
    return (
      <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm">
        <span className="text-muted-foreground">Estágio do master:</span>
        <EventStageBadge stage={props.stage} />
        <Link to={`/eventos/${props.parentEventId}`} className="text-primary underline-offset-2 hover:underline">
          Abrir {props.parentName || "evento master"}
        </Link>
      </div>
    );
  }

  const acts = stageActions({
    stage: props.stage, isSubEvent: false, isAdmin: props.isAdmin, isManager: props.isManager,
    checklistOk: checklist?.ok === true,
  });
  if (!acts.showPanel) return null;
  const showChecklist = props.stage === "em_fecho" || props.stage === "em_curso";
  const cfg = action ? DIALOG[action] : null;

  const submit = () => {
    if (!action) return;
    if (cfg?.reason === "required" && !reason.trim()) {
      toast({ title: "Indique o motivo da reabertura.", variant: "destructive" });
      return;
    }
    mutation.mutate({ action, reason }, {
      onSuccess: () => { toast({ title: `${cfg?.confirm}: concluído` }); setAction(null); setReason(""); },
      onError: (e) => toast({ title: "Ação recusada", description: mapStageError(e), variant: "destructive" }),
    });
  };

  return (
    <div className="glass space-y-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estágio e fecho</h3>
        <EventStageBadge stage={props.stage} />
        <div className="ml-auto flex flex-wrap gap-2">
          {acts.canClose && (
            <Button size="sm" disabled={!acts.closeEnabled || mutation.isPending} onClick={() => setAction("close")}
              title={acts.closeEnabled ? undefined : "Resolva as pendências da checklist"}>
              <Lock className="h-3.5 w-3.5" /> Fechar evento
            </Button>
          )}
          {acts.canReopenClosure && (
            <Button size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => setAction("reopen")}>
              <LockOpen className="h-3.5 w-3.5" /> Reabrir fecho
            </Button>
          )}
          {acts.canMarkHistorical && (
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setAction("mark")}>
              <Archive className="h-3.5 w-3.5" /> Marcar como histórico
            </Button>
          )}
          {acts.canUnmarkHistorical && (
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setAction("unmark")}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Remover de histórico
            </Button>
          )}
        </div>
      </div>

      {showChecklist && (
        isLoading ? <p className="text-xs text-muted-foreground">A carregar checklist…</p> :
        checklist && (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Checklist do fecho">
            {checklist.blocks.map((b) => (
              <li key={b.key} className="flex gap-2 rounded-lg border border-border bg-secondary/30 p-2.5">
                {b.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <CircleAlert className="h-4 w-4 shrink-0 text-warning" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{b.title} <span className={b.ok ? "text-success" : "text-warning"}>· {b.ok ? "ok" : "pendente"}</span></p>
                  <p className="text-xs text-muted-foreground">{b.detail}</p>
                  {b.items && b.items.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{b.items.map((i) => <li key={i}>{i}</li>)}</ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cfg?.title}</DialogTitle>
            <DialogDescription>{cfg?.desc}</DialogDescription>
          </DialogHeader>
          {cfg && cfg.reason !== "none" && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={cfg.reason === "required" ? "Motivo (obrigatório)" : "Motivo (opcional)"}
              aria-label="Motivo"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={mutation.isPending || (cfg?.reason === "required" && !reason.trim())}>
              {mutation.isPending ? "A gravar…" : cfg?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
