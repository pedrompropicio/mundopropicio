import { useState } from "react";
import { useBPVersions, useDiscardScenarioDraft, usePromoteScenarioDraft } from "@/hooks/useBPVersions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trash2, Rocket } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  eventId: string;
  canManage: boolean;
  isMaster: boolean;
  isSplit: boolean;
}

/**
 * Lista cenários working_draft do evento, com ações descartar/promover.
 * Em Splits, mostra cenários cascateados como read-only (gerir só no Master).
 */
export function ScenarioDraftsList({ eventId, canManage, isMaster, isSplit }: Props) {
  const { data: versions = [] } = useBPVersions(eventId);
  const discard = useDiscardScenarioDraft(eventId);
  const promote = usePromoteScenarioDraft(eventId);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<{ id: string; label: string } | null>(null);

  const drafts = versions.filter((v) => v.state === ("working_draft" as any));

  if (drafts.length === 0) return null;

  return (
    <div className="glass rounded-xl px-4 py-3 border-primary/10 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">
          {drafts.length} cenário{drafts.length > 1 ? "s" : ""} em construção
        </p>
        {isSplit && (
          <Badge variant="outline" className="text-[10px]">
            Geridos no Master
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {drafts.map((d) => {
          const dateLabel = format(new Date(d.created_at), "d MMM yyyy", { locale: pt });
          const isCascaded = Boolean(d.cascaded_from_version_id);
          return (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {d.scenario_label ?? `Cenário v${d.version_number}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Criado {dateLabel} por {d.created_by_label ?? "—"}
                  {d.description ? ` · ${d.description}` : ""}
                </p>
              </div>

              {canManage && !isCascaded && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setConfirmPromote({ id: d.id, label: d.scenario_label ?? `v${d.version_number}` })
                    }
                  >
                    <Rocket className="h-4 w-4 mr-1.5" />
                    Promover
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDiscard(d.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={confirmDiscard !== null}
        onOpenChange={(o) => !o && setConfirmDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cenário?</AlertDialogTitle>
            <AlertDialogDescription>
              O cenário e todas as suas linhas serão eliminados (incluindo a cópia nos Splits, em
              caso de turnê). A versão Ativa não é afetada. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDiscard) {
                  await discard.mutateAsync(confirmDiscard);
                  setConfirmDiscard(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmPromote !== null}
        onOpenChange={(o) => !o && setConfirmPromote(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Promover cenário "{confirmPromote?.label}" a Ativa?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A versão Ativa atual passa para o histórico (superseded) e o cenário toma o seu
              lugar. Em turnê, a promoção cascateia para todos os Splits. Esta ação afeta o BP em
              produção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmPromote) {
                  await promote.mutateAsync({ scenarioVersionId: confirmPromote.id });
                  setConfirmPromote(null);
                }
              }}
            >
              Promover a Ativa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
