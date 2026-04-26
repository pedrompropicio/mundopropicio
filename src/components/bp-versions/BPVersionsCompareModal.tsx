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
import { GitCompare, Download, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { useBPVersions, type BPVersionRow } from "@/hooks/useBPVersions";
import { diffSnapshots, type DiffRow, type ForecastSnapshot } from "@/lib/bp-version-diff";
import { exportBPVersionComparisonPDF } from "@/lib/export-bp-version-comparison-pdf";
import { buildCategoryLookup } from "@/lib/category-hierarchy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
}

export function BPVersionsCompareModal({ open, onOpenChange, eventId, eventName }: Props) {
  const { data: versions = [], isLoading: loadingVersions } = useBPVersions(eventId);
  const [versionAId, setVersionAId] = useState<string | null>(null);
  const [versionBId, setVersionBId] = useState<string | null>(null);
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  // Default selection: previous active vs current active (or two newest)
  useEffect(() => {
    if (!open || versions.length === 0) return;
    if (versionAId && versionBId) return;
    const active = versions.find((v) => v.state === "active");
    const previous = versions.find(
      (v) => v.state === "superseded" || (v.id !== active?.id && v.state !== "draft")
    );
    setVersionBId((prev) => prev ?? active?.id ?? versions[0]?.id ?? null);
    setVersionAId((prev) => prev ?? previous?.id ?? versions[1]?.id ?? versions[0]?.id ?? null);
  }, [open, versions, versionAId, versionBId]);

  // Fetch full snapshot payloads for the two selected versions
  const { data: payloads } = useQuery({
    queryKey: ["bp-version-snapshots", versionAId, versionBId],
    enabled: open && !!versionAId && !!versionBId,
    queryFn: async () => {
      const ids = [versionAId, versionBId].filter(Boolean) as string[];
      const { data, error } = await supabase
        .from("bp_versions" as any)
        .select("id, snapshot_payload")
        .in("id", ids);
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

  const versionA = versions.find((v) => v.id === versionAId) ?? null;
  const versionB = versions.find((v) => v.id === versionBId) ?? null;

  const baseForecasts: ForecastSnapshot[] = (payloads?.[versionAId ?? ""]?.forecasts ?? []) as any;
  const compareForecasts: ForecastSnapshot[] = (payloads?.[versionBId ?? ""]?.forecasts ?? []) as any;

  const { rows, summary } = useMemo(
    () => diffSnapshots(baseForecasts, compareForecasts),
    [baseForecasts, compareForecasts]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; code: string; rows: DiffRow[] }>();
    for (const r of rows) {
      const cat = r.category_id ? lookup[r.category_id] : null;
      const key = cat?.groupCode ?? "_sem_categoria";
      if (!map.has(key)) {
        map.set(key, {
          code: key,
          name: cat?.groupName ?? "Sem categoria",
          rows: [],
        });
      }
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [rows, lookup]);

  const visibleGroups = onlyDiffs
    ? grouped
        .map((g) => ({ ...g, rows: g.rows.filter((r) => r.status !== "unchanged") }))
        .filter((g) => g.rows.length > 0)
    : grouped;

  const handleExport = () => {
    if (!versionA || !versionB) return;
    exportBPVersionComparisonPDF({
      eventName,
      versionALabel: labelOf(versionA),
      versionBLabel: labelOf(versionB),
      rows,
      summary,
      categories: categories as any,
      showOnlyDifferences: onlyDiffs,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Comparação de versões do BP
          </DialogTitle>
          <DialogDescription>
            Escolhe duas versões para ver as diferenças linha a linha.
          </DialogDescription>
        </DialogHeader>

        {loadingVersions ? (
          <div className="py-8 text-center text-sm text-muted-foreground">A carregar versões…</div>
        ) : versions.length < 2 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            São necessárias pelo menos 2 versões para comparar.
          </div>
        ) : (
          <>
            {/* Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <VersionSelect
                label="Versão base (A)"
                versions={versions}
                value={versionAId}
                onChange={setVersionAId}
              />
              <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block mx-auto" />
              <VersionSelect
                label="Comparar com (B)"
                versions={versions}
                value={versionBId}
                onChange={setVersionBId}
              />
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard
                label="Δ resultado"
                value={`${summary.totalDelta >= 0 ? "+" : ""}${formatCurrency(summary.totalDelta)}`}
                tone={summary.totalDelta > 0 ? "good" : summary.totalDelta < 0 ? "bad" : "neutral"}
              />
              <StatCard label="Adicionadas" value={summary.addedCount.toString()} tone="good" />
              <StatCard label="Modificadas" value={summary.modifiedCount.toString()} tone="warn" />
              <StatCard label="Removidas" value={summary.removedCount.toString()} tone="bad" />
            </div>

            <div className="flex items-center justify-between gap-2 px-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
                <span>Mostrar apenas linhas com diferenças</span>
              </label>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
                <Download className="h-4 w-4 mr-1.5" />
                Exportar PDF
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 border-t pt-3">
              {visibleGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "Sem linhas em qualquer das versões."
                    : "Nenhuma diferença entre as versões selecionadas."}
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {visibleGroups.map((group) => (
                    <div key={group.code}>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 sticky top-0 bg-background py-1">
                        {group.name}
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium">Estado</th>
                              <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
                              <th className="text-left px-3 py-1.5 font-medium">Descrição</th>
                              <th className="text-right px-3 py-1.5 font-medium">{labelOf(versionA)}</th>
                              <th className="text-right px-3 py-1.5 font-medium">{labelOf(versionB)}</th>
                              <th className="text-right px-3 py-1.5 font-medium">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((r) => (
                              <DiffTableRow key={r.id} row={r} />
                            ))}
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

function VersionSelect({
  label, versions, value, onChange,
}: {
  label: string;
  versions: BPVersionRow[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Escolher versão" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {labelOf(v)}
              {v.description ? ` — ${v.description}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "border-success/30 text-success"
      : tone === "bad"
        ? "border-destructive/30 text-destructive"
        : tone === "warn"
          ? "border-warning/30 text-warning"
          : "border-border text-foreground";
  return (
    <Card className={`p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </Card>
  );
}

function DiffTableRow({ row }: { row: DiffRow }) {
  const bg =
    row.status === "added"
      ? "bg-success/10"
      : row.status === "removed"
        ? "bg-destructive/10"
        : row.status === "modified"
          ? "bg-warning/10"
          : "";

  const statusBadge: Record<DiffRow["status"], { label: string; variant: any }> = {
    added: { label: "Adicionada", variant: "default" },
    removed: { label: "Removida", variant: "destructive" },
    modified: { label: "Modificada", variant: "secondary" },
    unchanged: { label: "—", variant: "outline" },
  };

  const dRender = () => {
    if (row.status === "unchanged" || row.delta === 0) return <Minus className="h-3 w-3 inline text-muted-foreground" />;
    const sign = row.delta > 0 ? "+" : "";
    const Icon = row.delta > 0 ? TrendingUp : TrendingDown;
    const colour = row.delta > 0 ? "text-success" : "text-destructive";
    return (
      <span className={`inline-flex items-center gap-1 ${colour}`}>
        <Icon className="h-3 w-3" />
        {sign}{formatCurrency(row.delta)}
      </span>
    );
  };

  return (
    <tr className={`border-t ${bg} ${row.status === "removed" ? "line-through opacity-70" : ""}`}>
      <td className="px-3 py-1.5">
        <Badge variant={statusBadge[row.status].variant} className="text-[10px]">
          {statusBadge[row.status].label}
        </Badge>
      </td>
      <td className="px-3 py-1.5 text-xs">
        {row.type === "income" ? "Receita" : "Despesa"}
      </td>
      <td className="px-3 py-1.5">{row.description}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {row.baseAmount == null ? "—" : formatCurrency(row.baseAmount)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {row.compareAmount == null ? "—" : formatCurrency(row.compareAmount)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{dRender()}</td>
    </tr>
  );
}
