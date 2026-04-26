import { useMemo, useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { GitCompare, Download, Plus, X, Pin, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { useBPVersions, type BPVersionRow } from "@/hooks/useBPVersions";
import { buildMultiDiff, type MultiDiffVersionMeta } from "@/lib/bp-version-multi-diff";
import { exportBPMultiVersionComparisonPDF } from "@/lib/export-bp-version-multi-comparison-pdf";
import { buildCategoryLookup } from "@/lib/category-hierarchy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
}

const MAX_VERSIONS = 4;
const MIN_VERSIONS = 2;

export function BPVersionsCompareModal({ open, onOpenChange, eventId, eventName }: Props) {
  const { data: versions = [], isLoading: loadingVersions } = useBPVersions(eventId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  // Default selection: pinned scenarios + active version (cap at MAX_VERSIONS).
  useEffect(() => {
    if (!open || versions.length === 0 || selectedIds.length > 0) return;
    const active = versions.find((v) => v.state === "active");
    const pinned = versions.filter((v) => v.is_pinned_scenario);
    const previous = versions.find((v) => v.state === "superseded");
    const initial: string[] = [];
    if (active) initial.push(active.id);
    pinned.forEach((p) => {
      if (!initial.includes(p.id) && initial.length < MAX_VERSIONS) initial.push(p.id);
    });
    if (previous && initial.length < MIN_VERSIONS && !initial.includes(previous.id)) {
      initial.push(previous.id);
    }
    // Pad with newest non-archived versions until we have at least 2.
    for (const v of versions) {
      if (initial.length >= MIN_VERSIONS) break;
      if (v.state === "archived") continue;
      if (!initial.includes(v.id)) initial.push(v.id);
    }
    setSelectedIds(initial.slice(0, MAX_VERSIONS));
  }, [open, versions, selectedIds.length]);

  // Reset selection when modal closes.
  useEffect(() => {
    if (!open) setSelectedIds([]);
  }, [open]);

  // Fetch payloads for ALL selected versions.
  const { data: payloads } = useQuery({
    queryKey: ["bp-version-snapshots-multi", selectedIds],
    enabled: open && selectedIds.length >= MIN_VERSIONS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bp_versions" as any)
        .select("id, snapshot_payload")
        .in("id", selectedIds);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data ?? []).forEach((r: any) => {
        map[r.id] = r.snapshot_payload;
      });
      return map;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lookup = useMemo(() => buildCategoryLookup(categories as any), [categories]);

  const selectedVersions = useMemo(
    () =>
      selectedIds
        .map((id) => versions.find((v) => v.id === id))
        .filter(Boolean) as BPVersionRow[],
    [selectedIds, versions]
  );

  const versionMetas: MultiDiffVersionMeta[] = useMemo(
    () => selectedVersions.map((v) => ({ id: v.id, label: labelOf(v) })),
    [selectedVersions]
  );

  const snapshotsByVersion = useMemo(() => {
    const map: Record<string, any[]> = {};
    selectedVersions.forEach((v) => {
      map[v.id] = (payloads?.[v.id]?.forecasts ?? []) as any[];
    });
    return map;
  }, [payloads, selectedVersions]);

  const result = useMemo(() => {
    if (selectedVersions.length < MIN_VERSIONS) return null;
    return buildMultiDiff({ versions: versionMetas, snapshotsByVersion, lookup });
  }, [selectedVersions, versionMetas, snapshotsByVersion, lookup]);

  const visibleGroups = useMemo(() => {
    if (!result) return [];
    if (!onlyDiffs) return result.groups;
    return result.groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.hasDifferences) }))
      .filter((g) => g.rows.length > 0);
  }, [result, onlyDiffs]);

  const availableForAdd = versions.filter((v) => !selectedIds.includes(v.id));

  const handleRemove = (id: string) => {
    if (selectedIds.length <= MIN_VERSIONS) return;
    setSelectedIds(selectedIds.filter((x) => x !== id));
  };
  const handleAdd = (id: string) => {
    if (selectedIds.length >= MAX_VERSIONS) return;
    setSelectedIds([...selectedIds, id]);
  };
  const handleReplace = (idx: number, newId: string) => {
    if (selectedIds.includes(newId)) return;
    const next = [...selectedIds];
    next[idx] = newId;
    setSelectedIds(next);
  };

  const handleExport = () => {
    if (!result) return;
    exportBPMultiVersionComparisonPDF({
      eventName,
      result,
      showOnlyDifferences: onlyDiffs,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Comparação de versões do BP
          </DialogTitle>
          <DialogDescription>
            Compara entre {MIN_VERSIONS} e {MAX_VERSIONS} versões lado a lado.
            Cenários fixados aparecem por defeito.
          </DialogDescription>
        </DialogHeader>

        {loadingVersions ? (
          <div className="py-8 text-center text-sm text-muted-foreground">A carregar versões…</div>
        ) : versions.length < MIN_VERSIONS ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            São necessárias pelo menos {MIN_VERSIONS} versões para comparar.
          </div>
        ) : (
          <>
            {/* Version chips + add slot */}
            <div className="flex flex-wrap gap-2 items-end">
              {selectedVersions.map((v, idx) => (
                <div key={v.id} className="flex flex-col gap-1 min-w-[180px]">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    Versão {idx + 1}
                    {v.is_pinned_scenario && <Pin className="h-3 w-3 text-warning" />}
                    {v.scenario_label && <Sparkles className="h-3 w-3 text-primary" />}
                  </label>
                  <div className="flex gap-1">
                    <Select value={v.id} onValueChange={(val) => handleReplace(idx, val)}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {versions
                          .filter((x) => x.id === v.id || !selectedIds.includes(x.id))
                          .map((x) => (
                            <SelectItem key={x.id} value={x.id} className="text-xs">
                              {labelOf(x)}
                              {x.description ? ` — ${x.description}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {selectedIds.length > MIN_VERSIONS && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleRemove(v.id)}
                        title="Remover desta comparação"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {selectedIds.length < MAX_VERSIONS && availableForAdd.length > 0 && (
                <div className="flex flex-col gap-1 min-w-[180px]">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Adicionar
                  </label>
                  <Select value="" onValueChange={(val) => handleAdd(val)}>
                    <SelectTrigger className="text-xs h-8 border-dashed">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar versão
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {availableForAdd.map((x) => (
                        <SelectItem key={x.id} value={x.id} className="text-xs">
                          {labelOf(x)}
                          {x.description ? ` — ${x.description}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Summary cards */}
            {result && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SummaryCard
                  label="Receita por versão"
                  values={result.summary.income}
                  versions={versionMetas}
                />
                <SummaryCard
                  label="Despesa por versão"
                  values={result.summary.expense}
                  versions={versionMetas}
                />
                <SummaryCard
                  label="Resultado por versão"
                  values={result.summary.result}
                  versions={versionMetas}
                  toneByValue
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
                <span>Mostrar apenas linhas com diferenças</span>
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={!result || result.groups.length === 0}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Exportar PDF
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 border-t pt-3">
              {!result || visibleGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {!result
                    ? "A calcular comparação…"
                    : result.groups.length === 0
                      ? "Sem linhas em qualquer das versões."
                      : "Nenhuma diferença entre as versões selecionadas."}
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {visibleGroups.map((group) => (
                    <div key={group.groupCode}>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 sticky top-0 bg-background py-1">
                        {group.groupName}
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium w-16">Tipo</th>
                              <th className="text-left px-3 py-1.5 font-medium">Descrição</th>
                              {versionMetas.map((v) => (
                                <th
                                  key={v.id}
                                  className="text-right px-3 py-1.5 font-medium whitespace-nowrap"
                                >
                                  {v.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((r) => (
                              <tr
                                key={r.forecastId}
                                className={`border-t ${r.hasDifferences ? "bg-warning/5" : ""}`}
                              >
                                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                  {r.type === "income" ? "Rec." : "Desp."}
                                </td>
                                <td className="px-3 py-1.5">{r.description}</td>
                                {r.cells.map((c, i) => (
                                  <td
                                    key={i}
                                    className={`px-3 py-1.5 text-right tabular-nums ${
                                      c.amount == null ? "text-muted-foreground italic" : ""
                                    }`}
                                  >
                                    {c.amount == null ? "—" : formatCurrency(c.amount)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr className="border-t bg-muted/30 font-medium">
                              <td colSpan={2} className="px-3 py-1.5 text-right text-xs">
                                Subtotal — {group.groupName}
                              </td>
                              {group.totalsBase.map((t, i) => (
                                <td
                                  key={i}
                                  className="px-3 py-1.5 text-right tabular-nums text-xs"
                                >
                                  {formatCurrency(t)}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function labelOf(v: BPVersionRow | null): string {
  if (!v) return "—";
  const base = `v${v.version_number}`;
  if (v.scenario_label) return `${base} (${v.scenario_label})`;
  if (v.state === "active") return `${base} (Ativa)`;
  if (v.state === "draft") return `${base} (Rascunho)`;
  if (v.state === "archived") return `${base} (Arquivada)`;
  return base;
}

function SummaryCard({
  label,
  values,
  versions,
  toneByValue,
}: {
  label: string;
  values: number[];
  versions: MultiDiffVersionMeta[];
  toneByValue?: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="space-y-0.5">
        {versions.map((v, i) => {
          const value = values[i] ?? 0;
          const tone = toneByValue
            ? value > 0
              ? "text-success"
              : value < 0
                ? "text-destructive"
                : ""
            : "";
          return (
            <div key={v.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground truncate">{v.label}</span>
              <span className={`tabular-nums font-medium ${tone}`}>
                {formatCurrency(value)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
