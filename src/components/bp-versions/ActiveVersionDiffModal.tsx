import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Undo2, ArrowRight, Plus, Minus, Pencil, History } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  useActiveVersionDiff,
  type DiffEntry,
  type SnapshotRow,
} from "@/hooks/useActiveVersionDiff";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  canManage: boolean;
}

/**
 * Lista as alterações pendentes na Versão Ativa (Real vs. snapshot da v ativa)
 * e permite reverter cada linha individualmente, ou todas de uma vez. Útil
 * quando se faz ajustes diretos no BP em produção e queremos comparar com a
 * última fotografia oficial antes de congelar uma nova versão.
 */
export function ActiveVersionDiffModal({ open, onOpenChange, eventId, canManage }: Props) {
  const { data, isLoading } = useActiveVersionDiff(eventId);
  const queryClient = useQueryClient();
  const [confirmRevertAll, setConfirmRevertAll] = useState(false);

  const counts = useMemo(() => {
    const entries = data?.entries ?? [];
    return {
      total: entries.length,
      modified: entries.filter((e) => e.status === "modified").length,
      added: entries.filter((e) => e.status === "added").length,
      removed: entries.filter((e) => e.status === "removed").length,
    };
  }, [data?.entries]);

  const revertSingleMutation = useMutation({
    mutationFn: async (entry: DiffEntry) => {
      if (entry.status === "modified" && entry.before) {
        const { error } = await supabase
          .from("event_forecasts")
          .update(snapshotToUpdate(entry.before))
          .eq("id", entry.forecastId);
        if (error) throw error;
      } else if (entry.status === "added") {
        const { error } = await supabase
          .from("event_forecasts")
          .delete()
          .eq("id", entry.forecastId);
        if (error) throw error;
      } else if (entry.status === "removed" && entry.before) {
        const { error } = await supabase
          .from("event_forecasts")
          .insert(snapshotToInsert(entry.before, eventId));
        if (error) throw error;
      }
    },
    onSuccess: (_, entry) => {
      queryClient.invalidateQueries({ queryKey: ["active-version-diff", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({
        title: "Linha revertida",
        description: `"${entry.before?.description ?? entry.after?.description}" voltou ao estado da versão ativa.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Erro ao reverter",
        description: err.message,
        variant: "destructive",
      }),
  });

  const revertAllMutation = useMutation({
    mutationFn: async () => {
      const entries = data?.entries ?? [];
      for (const entry of entries) {
        if (entry.status === "modified" && entry.before) {
          await supabase
            .from("event_forecasts")
            .update(snapshotToUpdate(entry.before))
            .eq("id", entry.forecastId);
        } else if (entry.status === "added") {
          await supabase
            .from("event_forecasts")
            .delete()
            .eq("id", entry.forecastId);
        } else if (entry.status === "removed" && entry.before) {
          await supabase
            .from("event_forecasts")
            .insert(snapshotToInsert(entry.before, eventId));
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-version-diff", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({
        title: "Alterações revertidas",
        description: `${counts.total} linha(s) voltaram ao estado da versão ativa.`,
      });
      setConfirmRevertAll(false);
    },
    onError: (err: any) =>
      toast({
        title: "Erro ao reverter tudo",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Alterações pendentes vs. Versão Ativa
              {data?.versionNumber != null && (
                <Badge variant="outline">v{data.versionNumber}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Diferenças entre o BP atual e a fotografia da versão ativa
              {data?.versionApprovedAt && (
                <>
                  {" "}
                  (aprovada em{" "}
                  {format(new Date(data.versionApprovedAt), "d MMM yyyy", { locale: pt })})
                </>
              )}
              . Cada linha pode ser revertida individualmente.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">A carregar diff…</div>
          ) : counts.total === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem alterações pendentes — o BP atual está sincronizado com a versão ativa.
            </div>
          ) : (
            <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <TabsList>
                  <TabsTrigger value="all">Todas ({counts.total})</TabsTrigger>
                  <TabsTrigger value="modified" disabled={counts.modified === 0}>
                    Modificadas ({counts.modified})
                  </TabsTrigger>
                  <TabsTrigger value="added" disabled={counts.added === 0}>
                    Adicionadas ({counts.added})
                  </TabsTrigger>
                  <TabsTrigger value="removed" disabled={counts.removed === 0}>
                    Removidas ({counts.removed})
                  </TabsTrigger>
                </TabsList>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revertAllMutation.isPending}
                    onClick={() => setConfirmRevertAll(true)}
                  >
                    <Undo2 className="h-4 w-4 mr-1.5" />
                    Reverter todas
                  </Button>
                )}
              </div>

              {(["all", "modified", "added", "removed"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="flex-1 min-h-0 mt-3">
                  <ScrollArea className="h-[55vh] pr-3">
                    <div className="space-y-2">
                      {(data?.entries ?? [])
                        .filter((e) => tab === "all" || e.status === tab)
                        .map((entry) => (
                          <DiffRow
                            key={entry.forecastId}
                            entry={entry}
                            canManage={canManage}
                            onRevert={() => revertSingleMutation.mutate(entry)}
                            isReverting={revertSingleMutation.isPending}
                          />
                        ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRevertAll} onOpenChange={setConfirmRevertAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter todas as alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.total} linha(s) voltarão ao estado da versão ativa v{data?.versionNumber}.
              Esta ação não pode ser desfeita automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revertAllMutation.mutate()}>
              Reverter tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface DiffRowProps {
  entry: DiffEntry;
  canManage: boolean;
  onRevert: () => void;
  isReverting: boolean;
}

function DiffRow({ entry, canManage, onRevert, isReverting }: DiffRowProps) {
  const description = entry.after?.description ?? entry.before?.description ?? "—";

  const statusMeta = {
    modified: {
      icon: Pencil,
      label: "Modificada",
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    added: {
      icon: Plus,
      label: "Adicionada",
      cls: "bg-success/10 text-success border-success/30",
    },
    removed: {
      icon: Minus,
      label: "Removida",
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
  } as const;

  const meta = statusMeta[entry.status];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("gap-1 text-[10px]", meta.cls)}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <span className="text-sm font-medium truncate">{description}</span>
            <Badge variant="outline" className="text-[10px]">
              {(entry.after?.type ?? entry.before?.type) === "income" ? "Receita" : "Despesa"}
            </Badge>
          </div>

          {entry.status === "modified" && entry.before && entry.after && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Campos alterados: <span className="font-medium">{entry.changedFields.join(", ")}</span>
              </p>
              <ChangeRow label="Valor base" before={formatCurrency(entry.before.amount, entry.before.currency)} after={formatCurrency(entry.after.amount, entry.after.currency)} highlight={entry.before.amount !== entry.after.amount} />
              {entry.before.iva_rate !== entry.after.iva_rate && (
                <ChangeRow label="IVA" before={`${entry.before.iva_rate}%`} after={`${entry.after.iva_rate}%`} highlight />
              )}
              {entry.before.description !== entry.after.description && (
                <ChangeRow label="Descrição" before={entry.before.description} after={entry.after.description} highlight />
              )}
              {entry.before.specification !== entry.after.specification && (
                <ChangeRow label="Especificação" before={entry.before.specification ?? "—"} after={entry.after.specification ?? "—"} highlight />
              )}
              {entry.before.status !== entry.after.status && (
                <ChangeRow label="Estado" before={entry.before.status} after={entry.after.status} highlight />
              )}
            </div>
          )}

          {entry.status === "added" && entry.after && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Nova linha · {formatCurrency(entry.after.amount, entry.after.currency)} · IVA {entry.after.iva_rate}%
            </p>
          )}

          {entry.status === "removed" && entry.before && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Eliminada · era {formatCurrency(entry.before.amount, entry.before.currency)} · IVA {entry.before.iva_rate}%
            </p>
          )}
        </div>

        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isReverting}
            onClick={onRevert}
            className="shrink-0"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />
            Reverter
          </Button>
        )}
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  before,
  after,
  highlight,
}: {
  label: string;
  before: string;
  after: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr_auto_1fr] gap-2 items-center text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate", highlight && "line-through text-muted-foreground")}>
        {before}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className={cn("truncate", highlight && "font-semibold text-foreground")}>
        {after}
      </span>
    </div>
  );
}

function snapshotToUpdate(row: SnapshotRow) {
  return {
    type: row.type,
    description: row.description,
    specification: row.specification,
    amount: row.amount,
    iva_rate: row.iva_rate,
    status: row.status,
    category_id: row.category_id,
    formula_type: row.formula_type,
    formula_value: row.formula_value,
    notes: row.notes,
    exclude_from_result: row.exclude_from_result,
    is_overhead: row.is_overhead,
    is_transitory: row.is_transitory,
    currency: row.currency,
    fx_rate: row.fx_rate,
    invoice_group_id: row.invoice_group_id,
    cache_config_id: row.cache_config_id,
    master_forecast_id: row.master_forecast_id,
  };
}

function snapshotToInsert(row: SnapshotRow, eventId: string) {
  return {
    id: row.id,
    event_id: eventId,
    ...snapshotToUpdate(row),
  };
}
