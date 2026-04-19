import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Crown, MapPin, X, Sparkles, AlertTriangle } from "lucide-react";

export interface SheetMappingTarget {
  /** "master" | "ignore" | child event id */
  value: string;
  label: string;
  isMaster?: boolean;
}

export interface SheetMappingItem {
  sheetName: string;
  rowCount: number;
  /** Selected target value (master id, child id, or "ignore") */
  target: string;
  /** True when chosen by the auto-matcher */
  autoMatched: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** All available targets — Master + children + an "ignore" option appended automatically */
  targets: SheetMappingTarget[];
  /** Initial mappings (with auto-suggestions already filled in) */
  initialMappings: SheetMappingItem[];
  onConfirm: (mappings: SheetMappingItem[]) => void;
}

/**
 * Generic mapping dialog: each detected sheet → a target sub-event (or Master,
 * or ignored). Same UX as the implementation flow, brought into the regular
 * Event → BP import.
 */
export default function BPSheetMappingModal({
  open,
  onOpenChange,
  targets,
  initialMappings,
  onConfirm,
}: Props) {
  const [mappings, setMappings] = useState<SheetMappingItem[]>(initialMappings);

  useEffect(() => {
    if (open) setMappings(initialMappings);
  }, [open, initialMappings]);

  const targetOptions = useMemo<SheetMappingTarget[]>(
    () => [...targets, { value: "ignore", label: "Ignorar (não importar)" }],
    [targets],
  );

  const labelFor = (value: string) =>
    targetOptions.find((t) => t.value === value)?.label ?? value;

  const setTarget = (sheetName: string, target: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sheetName === sheetName ? { ...m, target, autoMatched: false } : m,
      ),
    );
  };

  // Detect duplicate targets (excluding "ignore")
  const usedCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mappings) {
      if (m.target && m.target !== "ignore") c[m.target] = (c[m.target] ?? 0) + 1;
    }
    return c;
  }, [mappings]);

  const totalRows = mappings.reduce(
    (s, m) => (m.target !== "ignore" ? s + m.rowCount : s),
    0,
  );
  const ignoredCount = mappings.filter((m) => m.target === "ignore").length;
  const hasDuplicates = Object.values(usedCount).some((n) => n > 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Mapeamento de abas
          </DialogTitle>
          <DialogDescription>
            Cada aba da planilha foi associada a um sub-evento da turnê. Confirma
            ou ajusta o destino de cada uma. Linhas iguais entre todos os
            sub-eventos serão sugeridas para promover ao Master no passo seguinte.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-card divide-y">
          {mappings.map((m) => (
            <div
              key={m.sheetName}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{m.sheetName}</span>
                  <Badge variant="outline" className="text-xs">
                    {m.rowCount} linha{m.rowCount === 1 ? "" : "s"}
                  </Badge>
                  {m.autoMatched && (
                    <Badge variant="secondary" className="text-xs">
                      Auto: {labelFor(m.target)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="sm:w-72">
                <Select
                  value={m.target || "ignore"}
                  onValueChange={(v) => setTarget(m.sheetName, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher destino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-1.5">
                          {opt.value === "ignore" ? (
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : opt.isMaster ? (
                            <Crown className="h-3.5 w-3.5 text-warning" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                          )}
                          {opt.label}
                          {usedCount[opt.value] > 1 && opt.value !== "ignore" && (
                            <span className="text-xs text-destructive">
                              (usado {usedCount[opt.value]}×)
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        {hasDuplicates && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Duas ou mais abas estão a apontar para o mesmo destino. Ajusta antes de continuar
              ou marca uma como "Ignorar".
            </span>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          A importar: <strong>{totalRows}</strong> linhas ·{" "}
          {ignoredCount > 0 ? `${ignoredCount} aba(s) ignorada(s)` : "sem abas ignoradas"}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(mappings)}
            disabled={hasDuplicates || totalRows === 0}
          >
            Confirmar e importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
