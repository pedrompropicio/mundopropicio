/**
 * BP Grid Editor — Phase A.1 (MVP)
 * --------------------------------------------------------------
 * Spreadsheet-style editor for event_forecasts rows.
 * - Inline cell editing (description, category, amount, iva, formalidade, notes)
 * - Dirty tracking with manual save (Save button + ⌘S / Ctrl+S)
 * - Navigation block (useBlocker) when there are unsaved edits
 * - Auto BP snapshot before save when editing the Active version
 * - Atomic batch save via RPC batch_update_event_forecasts (rolls back on error)
 * - Virtualization (TanStack Virtual) for large BPs (≥ ~100 rows)
 * - Read-only badges for locked rows (overhead/excluded, adopted from Master,
 *   retroactive override) + global lock when canEditBP=false
 *
 * Phase A.2 (later): matrix paste, full inline validations, INSERT/DELETE in bulk.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// NOTE: useBlocker requires a data router (createBrowserRouter). This app uses
// the classic <BrowserRouter>, so importing/using it throws and white-screens
// the page (notably visible on mobile iOS). We rely on beforeunload only.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Save, Lock, AlertTriangle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Forecast = any;
type Category = { id: string; code: string; name: string; type: string; parent_id: string | null };

interface BPGridEditorProps {
  eventId: string;
  forecasts: Forecast[];
  categories: Category[];
  canEditBP: boolean;
  selectedVersionId: string | null;
}

type EditableField = "description" | "category_id" | "amount" | "iva_rate" | "formalidade" | "notes";
type DirtyMap = Record<string, Partial<Record<EditableField, any>>>;

const IVA_OPTIONS = [0, 6, 13, 23];
const FORMALIDADE_OPTIONS: { value: string; label: string }[] = [
  { value: "estimado", label: "Estimado" },
  { value: "negociacao", label: "Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "pago_parcial", label: "Pago parcial" },
  { value: "pago_total", label: "Pago total" },
];

function isRowLocked(row: Forecast, canEditBP: boolean): { locked: boolean; reason?: string } {
  if (!canEditBP) return { locked: true, reason: "Sem permissão de edição" };
  if (row?._overhead_via_master || row?._readonly) return { locked: true, reason: "Rateio vindo do Master" };
  if (row?.is_overhead || row?.exclude_from_result) return { locked: true, reason: "Overhead — editar no modal próprio" };
  if (row?.master_forecast_id) return { locked: true, reason: "Adotada do Master" };
  if (row?.is_retroactive_override) return { locked: true, reason: "Override retroativo" };
  return { locked: false };
}

export default function BPGridEditor({
  eventId,
  forecasts,
  categories,
  canEditBP,
  selectedVersionId,
}: BPGridEditorProps) {
  const queryClient = useQueryClient();

  // Only physical rows of this event — filter out synthetic master-overhead slices
  // and adopted rows from other events.
  const editableRows = useMemo(
    () =>
      (forecasts ?? []).filter(
        (f: Forecast) => !f?._overhead_via_master && !f?._readonly && f.event_id === eventId,
      ),
    [forecasts, eventId],
  );

  const [dirty, setDirty] = useState<DirtyMap>({});
  const dirtyCount = Object.keys(dirty).length;
  const hasDirty = dirtyCount > 0;

  // L3 categories only (no children)
  const l3CategoriesByType = useMemo(() => {
    const parentIds = new Set(categories.map((c) => c.parent_id).filter(Boolean) as string[]);
    const childOf = (id: string) => categories.some((c) => c.parent_id === id);
    const result: Record<string, { value: string; label: string }[]> = { income: [], expense: [] };
    categories.forEach((c) => {
      if (!childOf(c.id)) {
        const arr = result[c.type] || (result[c.type] = []);
        arr.push({ value: c.id, label: `${c.code} — ${c.name}` });
      }
    });
    // sort
    Object.values(result).forEach((arr) => arr.sort((a, b) => a.label.localeCompare(b.label)));
    return result;
  }, [categories]);

  const updateField = useCallback((id: string, field: EditableField, value: any, original: any) => {
    setDirty((prev) => {
      const next = { ...prev };
      const cur = { ...(next[id] ?? {}) };
      // Strip if back to original
      const isSame = (value ?? null) === (original ?? null);
      if (isSame) {
        delete cur[field];
      } else {
        cur[field] = value;
      }
      if (Object.keys(cur).length === 0) delete next[id];
      else next[id] = cur;
      return next;
    });
  }, []);

  const discardChanges = useCallback(() => {
    setDirty({});
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const editsArr = Object.entries(dirty).map(([id, fields]) => ({ id, ...fields }));
      if (editsArr.length === 0) return { updated: 0 };

      // G6: snapshot the Active version before edits so the user has a rollback point.
      if (selectedVersionId === null) {
        try {
          await supabase.rpc("create_bp_snapshot" as any, {
            _event_id: eventId,
            _description: `Edição em grelha — ${editsArr.length} linha(s)`,
            _approve_immediately: false,
          } as any);
        } catch (err) {
          // Snapshot failure must not block the edit (matches existing lifecycle rule:
          // snapshot failures are WARN, never block).
          console.warn("[BPGrid] snapshot failed (non-blocking)", err);
        }
      }

      const { data, error } = await supabase.rpc("batch_update_event_forecasts" as any, {
        _event_id: eventId,
        _version_id: selectedVersionId,
        _edits: editsArr,
      } as any);
      if (error) throw error;
      return data as { updated: number };
    },
    onSuccess: (res: any) => {
      setDirty({});
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast({ title: "BP guardado", description: `${res?.updated ?? 0} linha(s) atualizadas.` });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao guardar",
        description: err?.message ?? "A operação foi revertida — nenhuma linha foi alterada.",
        variant: "destructive",
      });
    },
  });

  // ⌘S / Ctrl+S → save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (hasDirty && !saveMutation.isPending) saveMutation.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasDirty, saveMutation]);

  // G7: block navigation when there are unsaved edits
  useBlocker(({ currentLocation, nextLocation }) => {
    if (!hasDirty) return false;
    if (currentLocation.pathname === nextLocation.pathname) return false;
    return !window.confirm(
      `Tens ${dirtyCount} alteração(ões) por guardar. Sair sem guardar?`,
    );
  });

  // Block window unload too (closing tab / refresh)
  useEffect(() => {
    if (!hasDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasDirty]);

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: editableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  if (editableRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
        Nenhuma linha editável neste evento.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {editableRows.length} linha(s) · {dirtyCount} por guardar
          </span>
          {hasDirty && (
            <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              Alterações não guardadas
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDirty && (
            <button
              type="button"
              onClick={discardChanges}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Descartar
            </button>
          )}
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!hasDirty || saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            title="⌘S / Ctrl+S"
          >
            <Save className="h-3.5 w-3.5" />
            {saveMutation.isPending
              ? "A guardar…"
              : hasDirty
                ? `Guardar (${dirtyCount})`
                : "Guardado"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[24px_80px_minmax(200px,2fr)_minmax(220px,2fr)_120px_80px_140px_minmax(160px,1fr)] gap-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div />
        <div>Tipo</div>
        <div>Descrição</div>
        <div>Categoria (L3)</div>
        <div className="text-right">Valor</div>
        <div className="text-right">IVA %</div>
        <div>Formalidade</div>
        <div>Notas</div>
      </div>

      {/* Virtualized rows */}
      <div
        ref={parentRef}
        className="max-h-[600px] overflow-auto rounded-lg border border-border/60 bg-background/40"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtual) => {
            const row = editableRows[virtual.index];
            const lock = isRowLocked(row, canEditBP);
            const rowDirty = dirty[row.id] ?? {};
            const currentVal = (field: EditableField, fallback: any) =>
              field in rowDirty ? rowDirty[field] : fallback;

            const opts = l3CategoriesByType[row.type] ?? [];

            return (
              <div
                key={row.id}
                data-index={virtual.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtual.start}px)`,
                }}
                className={`grid grid-cols-[24px_80px_minmax(200px,2fr)_minmax(220px,2fr)_120px_80px_140px_minmax(160px,1fr)] items-center gap-2 border-b border-border/40 px-3 py-2 text-xs ${
                  Object.keys(rowDirty).length > 0 ? "bg-primary/5" : ""
                }`}
              >
                <div title={lock.reason ?? ""}>
                  {lock.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      row.type === "income" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    }`}
                  >
                    {row.type === "income" ? "Receita" : "Despesa"}
                  </span>
                </div>
                <div>
                  <input
                    type="text"
                    disabled={lock.locked}
                    value={currentVal("description", row.description ?? "")}
                    onChange={(e) => updateField(row.id, "description", e.target.value, row.description)}
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <SearchableSelect
                    value={currentVal("category_id", row.category_id ?? "")}
                    onValueChange={(v: string) => updateField(row.id, "category_id", v || null, row.category_id)}
                    options={opts}
                    placeholder="Selecionar L3…"
                    disabled={lock.locked}
                  />

                </div>
                <div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={lock.locked}
                    value={currentVal("amount", row.amount ?? 0)}
                    onChange={(e) => {
                      const n = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      updateField(row.id, "amount", Number.isFinite(n) ? n : 0, Number(row.amount));
                    }}
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-right font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <select
                    disabled={lock.locked}
                    value={currentVal("iva_rate", row.iva_rate ?? 23)}
                    onChange={(e) => updateField(row.id, "iva_rate", parseInt(e.target.value), row.iva_rate)}
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-right text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {IVA_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    disabled={lock.locked}
                    value={currentVal("formalidade", row.formalidade ?? "estimado")}
                    onChange={(e) => updateField(row.id, "formalidade", e.target.value, row.formalidade)}
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {FORMALIDADE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    disabled={lock.locked}
                    value={currentVal("notes", row.notes ?? "")}
                    onChange={(e) => updateField(row.id, "notes", e.target.value, row.notes ?? "")}
                    placeholder="—"
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Fase A.1 — apenas edição. Adicionar/remover linhas continua na vista <em>Agrupada</em>. Atalho:{" "}
        <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘S</kbd> para guardar.
      </p>
    </div>
  );
}
