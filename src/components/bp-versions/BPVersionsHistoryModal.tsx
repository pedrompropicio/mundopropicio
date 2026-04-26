import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Archive, ArchiveRestore, Trash2, GitBranch, Layers, Sparkles,
  CheckCircle2, FileText, History as HistoryIcon, Clock, RotateCcw, AlertTriangle,
  Pin, PinOff, Rocket,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  useBPVersions,
  useArchiveBPVersion,
  useUnarchiveBPVersion,
  useDiscardBPVersionDraft,
  useRevertBPVersion,
  useBPLinkedTxCount,
  usePromoteScenario,
  useToggleScenarioPin,
  type BPVersionRow,
} from "@/hooks/useBPVersions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  isSplit: boolean;
  canManage: boolean;
}

const STATE_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  active: { label: "Ativa", variant: "default" },
  draft: { label: "Rascunho", variant: "outline" },
  superseded: { label: "Substituída", variant: "secondary" },
  archived: { label: "Arquivada", variant: "outline", className: "opacity-60" },
};

export function BPVersionsHistoryModal({
  open, onOpenChange, eventId, isSplit, canManage,
}: Props) {
  const { data: versions = [], isLoading } = useBPVersions(eventId);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<BPVersionRow | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<BPVersionRow | null>(null);
  const archive = useArchiveBPVersion(eventId);
  const unarchive = useUnarchiveBPVersion(eventId);
  const discard = useDiscardBPVersionDraft(eventId);
  const revert = useRevertBPVersion(eventId);
  const { data: linkedTxCount = 0 } = useBPLinkedTxCount(
    confirmRevert ? eventId : null
  );

  const { official, scenarios } = useMemo(() => {
    const visible = showArchived ? versions : versions.filter((v) => v.state !== "archived");
    return {
      official: visible.filter((v) => !v.scenario_label),
      scenarios: visible.filter((v) => v.scenario_label),
    };
  }, [versions, showArchived]);

  const archivedCount = versions.filter((v) => v.state === "archived").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5" />
              Histórico de versões do BP
            </DialogTitle>
            <DialogDescription>
              {isSplit
                ? "Versões deste Split são herdadas do Master via cascade."
                : "Todas as versões e cenários do Business Plan deste evento."}
            </DialogDescription>
          </DialogHeader>

          {archivedCount > 0 && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-muted-foreground">
                {archivedCount} versão(ões) arquivada(s)
              </span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <span>Mostrar arquivadas</span>
                <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              </label>
            </div>
          )}

          <ScrollArea className="flex-1 -mx-6 px-6">
            {isLoading ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 bg-muted/40 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : official.length === 0 && scenarios.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Ainda não há versões registadas.
              </div>
            ) : (
              <div className="space-y-6 pb-2">
                <Section
                  title="Versões oficiais"
                  icon={<GitBranch className="h-4 w-4" />}
                  versions={official}
                  isSplit={isSplit}
                  canManage={canManage}
                  onArchive={(id) => archive.mutate(id)}
                  onUnarchive={(id) => unarchive.mutate(id)}
                  onDiscard={(v) => setConfirmDiscard(v)}
                  onRevert={(v) => setConfirmRevert(v)}
                />
                {scenarios.length > 0 && (
                  <Section
                    title="Cenários de trabalho"
                    icon={<Sparkles className="h-4 w-4" />}
                    versions={scenarios}
                    isSplit={isSplit}
                    canManage={canManage}
                    onArchive={(id) => archive.mutate(id)}
                    onUnarchive={(id) => unarchive.mutate(id)}
                    onDiscard={(v) => setConfirmDiscard(v)}
                    onRevert={(v) => setConfirmRevert(v)}
                  />
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar rascunho v{confirmDiscard?.version_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é definitiva. O rascunho{" "}
              {confirmDiscard?.scenario_label ? `"${confirmDiscard.scenario_label}"` : ""} será apagado
              e, se for um Master, os seus Splits em rascunho também.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDiscard) discard.mutate(confirmDiscard.id);
                setConfirmDiscard(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RevertConfirmDialog
        version={confirmRevert}
        linkedTxCount={linkedTxCount}
        isPending={revert.isPending}
        onClose={() => setConfirmRevert(null)}
        onConfirm={(force) => {
          if (!confirmRevert) return;
          revert.mutate(
            { versionId: confirmRevert.id, force },
            {
              onSuccess: () => setConfirmRevert(null),
              onError: (err: any) => {
                // Keep dialog open so user can re-check the "force" toggle
                // and inspect the explanation.
                console.error("revert failed:", err);
              },
            }
          );
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title, icon, versions, isSplit, canManage, onArchive, onUnarchive, onDiscard, onRevert,
}: {
  title: string;
  icon: React.ReactNode;
  versions: BPVersionRow[];
  isSplit: boolean;
  canManage: boolean;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDiscard: (v: BPVersionRow) => void;
  onRevert: (v: BPVersionRow) => void;
}) {
  if (versions.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {icon}
        {title} <span className="text-muted-foreground/60">({versions.length})</span>
      </h3>
      <div className="space-y-2">
        {versions.map((v) => (
          <VersionRow
            key={v.id}
            version={v}
            isSplit={isSplit}
            canManage={canManage}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDiscard={onDiscard}
            onRevert={onRevert}
          />
        ))}
      </div>
    </div>
  );
}

function VersionRow({
  version, isSplit, canManage, onArchive, onUnarchive, onDiscard, onRevert,
}: {
  version: BPVersionRow;
  isSplit: boolean;
  canManage: boolean;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDiscard: (v: BPVersionRow) => void;
  onRevert: (v: BPVersionRow) => void;
}) {
  const meta = STATE_META[version.state] ?? STATE_META.draft;
  const dt = version.approved_at ?? version.created_at;
  const dateLabel = format(new Date(dt), "d MMM yyyy 'às' HH:mm", { locale: pt });
  const isArchived = version.state === "archived";
  const isActive = version.state === "active";
  const isDraft = version.state === "draft";
  const isCascaded = !!version.cascaded_from_version_id;
  const isScenario = !!version.scenario_label;
  // Revert is allowed on superseded official versions only.
  const canRevert = !isActive && !isDraft && !isArchived && !isScenario;

  return (
    <div
      className={`rounded-lg border p-3 flex items-start justify-between gap-3 transition ${
        isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      } ${isArchived ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className={`rounded-full p-2 shrink-0 ${
            isActive ? "bg-primary/15" : "bg-muted"
          }`}
        >
          {isActive ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : version.scenario_label ? (
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">v{version.version_number}</span>
            <Badge variant={meta.variant} className={`text-[10px] uppercase tracking-wider ${meta.className ?? ""}`}>
              {meta.label}
            </Badge>
            {version.scenario_label && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                {version.scenario_label}
              </Badge>
            )}
            {version.is_pinned_scenario && (
              <Badge variant="outline" className="text-[10px]">Fixado</Badge>
            )}
            {isCascaded && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Layers className="h-2.5 w-2.5" />
                Do Master
              </Badge>
            )}
            {version.is_retroactive_snapshot && (
              <Badge variant="outline" className="text-[10px]">Retroativo</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <Clock className="h-3 w-3" />
            <span>{dateLabel}</span>
            <span>· {version.created_by_label ?? "—"}</span>
            <span>· {version.forecast_count} linha(s)</span>
          </div>
          {version.description && (
            <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{version.description}</p>
          )}
        </div>
      </div>

      {canManage && !isSplit && (
        <div className="flex items-center gap-1 shrink-0">
          {canRevert && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevert(version)}
              title="Reverter para esta versão"
              className="text-warning hover:text-warning/80"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {isArchived ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnarchive(version.id)}
              title="Desarquivar"
            >
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {isDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDiscard(version)}
                  title="Descartar rascunho"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {!isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onArchive(version.id)}
                  title="Arquivar"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RevertConfirmDialog({
  version, linkedTxCount, isPending, onClose, onConfirm,
}: {
  version: BPVersionRow | null;
  linkedTxCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
}) {
  const [force, setForce] = useState(false);
  const blocked = linkedTxCount > 0 && !force;

  return (
    <AlertDialog open={!!version} onOpenChange={(o) => { if (!o) { onClose(); setForce(false); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-warning" />
            Reverter para v{version?.version_number}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta ação <strong>substitui o BP atual</strong> pelas linhas guardadas na versão
                v{version?.version_number}. A versão atual passa a "Substituída" e uma nova versão
                ativa retroativa será criada. Em Masters, a reversão propaga-se aos Splits.
              </p>
              {linkedTxCount > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                      <p className="font-semibold">
                        Existem {linkedTxCount} linha(s) do BP atual com transações vinculadas.
                      </p>
                      <p className="text-xs opacity-90">
                        Reverter quebra essas vinculações: as transações ficam órfãs (sem linha de BP).
                        Recomenda-se desvincular ou eliminar essas transações antes de reverter.
                      </p>
                      <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={force}
                          onChange={(e) => setForce(e.target.checked)}
                          className="accent-destructive"
                        />
                        <span>Compreendo e quero reverter mesmo assim</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked || isPending}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={(e) => {
              e.preventDefault();
              onConfirm(force);
            }}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            {isPending ? "A reverter…" : "Reverter"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
