/**
 * BP Grid Editor — Phase A.2
 * --------------------------------------------------------------
 * Spreadsheet-style editor for event_forecasts rows.
 *
 * A.1 (shipped):
 *   - Inline cell editing (description, category, amount, iva, formalidade, notes)
 *   - Dirty tracking with manual save (Save button + ⌘S / Ctrl+S)
 *   - beforeunload guard for unsaved edits
 *   - Auto BP snapshot before save on the Active version
 *   - Atomic batch save via RPC batch_update_event_forecasts (rolls back on error)
 *   - Virtualization for large BPs (TanStack Virtual)
 *   - Locked rows: overhead/excluded, adopted from Master, retroactive override
 *
 * A.2 (this iteration):
 *   - Inline validation indicators (red border + tooltip) for amount/IVA/category/description
 *   - Save blocked when validation errors exist (summary toast)
 *   - Bulk INSERT of N draft rows via RPC batch_insert_event_forecasts (atomic)
 *   - Bulk DELETE of selected rows with cascade check for linked transactions
 *     (reuses deleteTransactionCascade per blocking transaction; safe loop)
 *   - Matrix paste: paste TSV (Excel/Sheets) into a text/amount cell to fill
 *     the focused column downward across consecutive editable rows
 *
 * Not in scope: editing overhead/master-adopted rows (use the dedicated modal).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Save, Lock, AlertTriangle, Undo2, Plus, Trash2, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { deleteTransactionCascade } from "@/lib/delete-transaction-cascade";
import { moveToTrash } from "@/lib/trash";
import { recordUndo } from "@/lib/undo";
import { showUndoToast } from "@/hooks/useUndoToast";
import { useAuth } from "@/contexts/AuthContext";
import { compareHierarchicalCodes } from "@/lib/utils";

const EUR_FMT = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseAmountInput(raw: string): number {
  const cleaned = raw
    .replace(/[€\s]/g, "")
    .replace(/[^\d,.\-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

interface AmountCellProps {
  value: number;
  onCommit: (n: number) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  hasError?: boolean;
  title?: string;
}

function AmountCell({ value, onCommit, onPaste, disabled, hasError, title }: AmountCellProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const num = Number(value) || 0;
  const display = focused ? draft : EUR_FMT.format(num);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={display}
      title={title}
      onFocus={(e) => {
        setFocused(true);
        setDraft(num ? String(num).replace(".", ",") : "");
        // select all for fast overwrite
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const n = parseAmountInput(draft);
        if (n !== num) onCommit(n);
      }}
      onPaste={onPaste}
      className={`w-full rounded-md border bg-background px-2 py-1 text-right font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
        hasError ? "border-destructive" : "border-border/60"
      }`}
    />
  );
}

type Forecast = any;
type Category = { id: string; code: string; name: string; type: string; parent_id: string | null };

interface BPGridEditorProps {
  eventId: string;
  forecasts: Forecast[];
  categories: Category[];
  canEditBP: boolean;
  selectedVersionId: string | null;
}

type EditableField = "description" | "specification" | "category_id" | "amount" | "iva_rate" | "formalidade" | "notes";
type DirtyMap = Record<string, Partial<Record<EditableField, any>>>;

interface PendingInsert {
  tempId: string;
  type: "income" | "expense";
  description: string;
  specification: string;
  category_id: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string;
  notes: string;
  /** false until the user edits any field — pristine rows don't count as validation errors */
  touched: boolean;
}

function isPendingPristine(p: PendingInsert): boolean {
  return (
    !p.touched &&
    (p.description ?? "").trim() === "" &&
    (p.specification ?? "").trim() === "" &&
    !p.category_id &&
    (!Number.isFinite(p.amount) || p.amount === 0) &&
    (p.notes ?? "") === ""
  );
}

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

/** Returns map of field → error message for the row's effective values */
function validateRow(
  effective: { type: string; description: string; category_id: string | null; amount: number; iva_rate: number },
  l3Set: Set<string>,
  categoryTypeById: Map<string, string>,
): Partial<Record<EditableField, string>> {
  const errs: Partial<Record<EditableField, string>> = {};
  if (!effective.description || effective.description.trim().length === 0) errs.description = "Obrigatório";
  if (!Number.isFinite(effective.amount) || effective.amount < 0) errs.amount = "Valor inválido";
  if (![0, 6, 13, 23].includes(effective.iva_rate)) errs.iva_rate = "IVA inválido";
  if (effective.category_id) {
    if (!l3Set.has(effective.category_id)) errs.category_id = "Categoria não é L3";
    else if (categoryTypeById.get(effective.category_id) !== effective.type)
      errs.category_id = "Categoria não corresponde ao tipo";
  }
  return errs;
}

const newPending = (type: "income" | "expense"): PendingInsert => ({
  tempId: `tmp_${Math.random().toString(36).slice(2)}`,
  type,
  description: "",
  category_id: null,
  amount: 0,
  iva_rate: 23,
  formalidade: "estimado",
  notes: "",
  touched: false,
});

export default function BPGridEditor({
  eventId,
  forecasts,
  categories,
  canEditBP,
  selectedVersionId,
}: BPGridEditorProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const editableRows = useMemo(
    () =>
      (forecasts ?? []).filter(
        (f: Forecast) => !f?._overhead_via_master && !f?._readonly && f.event_id === eventId,
      ),
    [forecasts, eventId],
  );

  const [dirty, setDirty] = useState<DirtyMap>({});
  const [pendingInserts, setPendingInserts] = useState<PendingInsert[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const dirtyCount = Object.keys(dirty).length;
  const insertCount = pendingInserts.length;
  const hasUnsaved = dirtyCount > 0 || insertCount > 0;

  // L3 category lookups + code map for ordering / display
  const { l3CategoriesByType, l3Set, categoryTypeById, categoryCodeById, categoryById } = useMemo(() => {
    const childOf = new Set(categories.map((c) => c.parent_id).filter(Boolean) as string[]);
    const byType: Record<string, { value: string; label: string }[]> = { income: [], expense: [] };
    const l3 = new Set<string>();
    const typeById = new Map<string, string>();
    const codeById = new Map<string, string>();
    const byId = new Map<string, Category>();
    categories.forEach((c) => {
      typeById.set(c.id, c.type);
      codeById.set(c.id, c.code);
      byId.set(c.id, c);
      if (!childOf.has(c.id) || !categories.some((x) => x.parent_id === c.id)) {
        if (!categories.some((x) => x.parent_id === c.id)) {
          l3.add(c.id);
          (byType[c.type] || (byType[c.type] = [])).push({ value: c.id, label: `${c.code} — ${c.name}` });
        }
      }
    });
    Object.values(byType).forEach((arr) =>
      arr.sort((a, b) => compareHierarchicalCodes(a.label.split(" — ")[0], b.label.split(" — ")[0])),
    );
    return { l3CategoriesByType: byType, l3Set: l3, categoryTypeById: typeById, categoryCodeById: codeById, categoryById: byId };
  }, [categories]);

  // Chain helper: given an L3 category id, return its L1 + L2 ancestors.
  const chainFor = useCallback(
    (catId: string | null) => {
      if (!catId) return { l1: null as Category | null, l2: null as Category | null };
      const c3 = categoryById.get(catId);
      if (!c3) return { l1: null, l2: null };
      const c2 = c3.parent_id ? categoryById.get(c3.parent_id) ?? null : null;
      const c1 = c2?.parent_id ? categoryById.get(c2.parent_id) ?? null : c2 && !c2.parent_id ? c2 : null;
      // Normalize: if c2 has no parent, c2 is actually L1
      if (c2 && !c2.parent_id) return { l1: c2, l2: null };
      return { l1: c1, l2: c2 };
    },
    [categoryById],
  );

  // Stable ordering by chart-of-accounts code (ignoring dirty edits → no jumping).
  const sortedEditableRows = useMemo(() => {
    const arr = [...editableRows];
    arr.sort((a, b) => {
      const ca = categoryCodeById.get(a.category_id ?? "") ?? "";
      const cb = categoryCodeById.get(b.category_id ?? "") ?? "";
      if (!ca && !cb) return (a.id ?? "").localeCompare(b.id ?? "");
      if (!ca) return 1;
      if (!cb) return -1;
      const cmp = compareHierarchicalCodes(ca, cb);
      if (cmp !== 0) return cmp;
      return (a.description ?? "").localeCompare(b.description ?? "");
    });
    return arr;
  }, [editableRows, categoryCodeById]);

  // Interleave L1/L2 group headers in the virtualized list.
  type GridItem =
    | { kind: "header"; level: 1 | 2; code: string; name: string; key: string }
    | { kind: "row"; row: Forecast; rowIndex: number };
  const gridItems: GridItem[] = useMemo(() => {
    const out: GridItem[] = [];
    let lastL1 = "", lastL2 = "";
    sortedEditableRows.forEach((row, idx) => {
      const ch = chainFor(row.category_id ?? null);
      const l1c = ch.l1?.code ?? "";
      const l2c = ch.l2?.code ?? "";
      if (l1c && l1c !== lastL1) {
        out.push({ kind: "header", level: 1, code: l1c, name: ch.l1!.name, key: `h1-${l1c}` });
        lastL1 = l1c;
        lastL2 = "";
      }
      if (l2c && l2c !== lastL2) {
        out.push({ kind: "header", level: 2, code: l2c, name: ch.l2!.name, key: `h2-${l2c}` });
        lastL2 = l2c;
      }
      out.push({ kind: "row", row, rowIndex: idx });
    });
    return out;
  }, [sortedEditableRows, chainFor]);

  const updateField = useCallback((id: string, field: EditableField, value: any, original: any) => {
    setDirty((prev) => {
      const next = { ...prev };
      const cur = { ...(next[id] ?? {}) };
      const isSame = (value ?? null) === (original ?? null);
      if (isSame) delete cur[field];
      else cur[field] = value;
      if (Object.keys(cur).length === 0) delete next[id];
      else next[id] = cur;
      return next;
    });
  }, []);

  const updatePending = useCallback((tempId: string, field: keyof PendingInsert, value: any) => {
    setPendingInserts((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value, touched: true } : r)),
    );
  }, []);

  // Focus + scroll-to-top tracking for newly added pending rows
  const [focusTempId, setFocusTempId] = useState<string | null>(null);
  const addPending = useCallback((type: "income" | "expense") => {
    const p = newPending(type);
    setPendingInserts((prev) => [p, ...prev]);
    setFocusTempId(p.tempId);
  }, []);

  const removePending = useCallback((tempId: string) => {
    setPendingInserts((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  // After adding a pending row, scroll to top and focus its description input
  useEffect(() => {
    if (!focusTempId) return;
    const raf = requestAnimationFrame(() => {
      const container = document.querySelector(`[data-pending-temp-id="${focusTempId}"]`) as HTMLElement | null;
      if (container) {
        container.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const input = container.querySelector("input[data-pending-desc-input]") as HTMLInputElement | null;
        input?.focus();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      setFocusTempId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusTempId]);



  const discardAll = useCallback(() => {
    const total = Object.keys(dirty).length + pendingInserts.length;
    if (total > 5) {
      const ok = window.confirm(
        `Descartar ${total} alteração(ões) não guardada(s)? Esta ação não pode ser desfeita.`,
      );
      if (!ok) return;
    }
    setDirty({});
    setPendingInserts([]);
  }, [dirty, pendingInserts]);

  // --- VALIDATION ---
  const rowEffective = (row: Forecast) => {
    const d = dirty[row.id] ?? {};
    return {
      type: row.type,
      description: ("description" in d ? d.description : row.description) ?? "",
      category_id: ("category_id" in d ? d.category_id : row.category_id) ?? null,
      amount: Number("amount" in d ? d.amount : row.amount ?? 0),
      iva_rate: Number("iva_rate" in d ? d.iva_rate : row.iva_rate ?? 23),
    };
  };

  const rowErrors = useMemo(() => {
    const m = new Map<string, Partial<Record<EditableField, string>>>();
    for (const id of Object.keys(dirty)) {
      const row = editableRows.find((r) => r.id === id);
      if (!row) continue;
      const errs = validateRow(rowEffective(row), l3Set, categoryTypeById);
      if (Object.keys(errs).length > 0) m.set(id, errs);
    }
    return m;
  }, [dirty, editableRows, l3Set, categoryTypeById]);

  // Errors shown in the UI / counted in the badge — pristine new rows are
  // considered "work in progress" and don't count until the user types something.
  const pendingErrors = useMemo(() => {
    const m = new Map<string, Partial<Record<EditableField, string>>>();
    for (const p of pendingInserts) {
      if (isPendingPristine(p)) continue;
      const errs = validateRow(
        { type: p.type, description: p.description, category_id: p.category_id, amount: p.amount, iva_rate: p.iva_rate },
        l3Set,
        categoryTypeById,
      );
      if (Object.keys(errs).length > 0) m.set(p.tempId, errs);
    }
    return m;
  }, [pendingInserts, l3Set, categoryTypeById]);

  // Save-blocking errors: validate ALL pending rows (including pristine empty ones),
  // so saving with a brand-new empty row is still blocked.
  const pendingSaveErrorsCount = useMemo(() => {
    let count = 0;
    for (const p of pendingInserts) {
      const errs = validateRow(
        { type: p.type, description: p.description, category_id: p.category_id, amount: p.amount, iva_rate: p.iva_rate },
        l3Set,
        categoryTypeById,
      );
      if (Object.keys(errs).length > 0) count++;
    }
    return count;
  }, [pendingInserts, l3Set, categoryTypeById]);

  const totalErrors = rowErrors.size + pendingErrors.size;
  const saveBlockingErrors = rowErrors.size + pendingSaveErrorsCount;

  // --- SAVE (inserts + updates, atomic per RPC) ---
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (saveBlockingErrors > 0) {
        // Surface pristine rows so the user sees the error before submitting
        setPendingInserts((prev) => prev.map((r) => ({ ...r, touched: true })));
        throw new Error(`${saveBlockingErrors} linha(s) com erros de validação`);
      }


      // Capture "before" snapshots of edited fields for post-save undo
      const editedFieldsByRow = new Map<string, EditableField[]>();
      for (const [id, fields] of Object.entries(dirty)) {
        editedFieldsByRow.set(id, Object.keys(fields) as EditableField[]);
      }
      const undoSnapshots: Array<{ id: string; before: Record<string, any> }> = [];
      for (const row of editableRows) {
        const fields = editedFieldsByRow.get(row.id);
        if (!fields || fields.length === 0) continue;
        const before: Record<string, any> = {};
        for (const f of fields) before[f] = (row as any)[f] ?? null;
        undoSnapshots.push({ id: row.id, before });
      }

      // Snapshot once on Active before any writes
      if (selectedVersionId === null && hasUnsaved) {
        try {
          await supabase.rpc("create_bp_snapshot" as any, {
            _event_id: eventId,
            _description: `Edição em grelha — ${dirtyCount} edição(ões) + ${insertCount} nova(s)`,
            _approve_immediately: false,
          } as any);
        } catch (err) {
          console.warn("[BPGrid] snapshot failed (non-blocking)", err);
        }
      }

      let insertedIds: string[] = [];
      if (insertCount > 0) {
        const payload = pendingInserts.map((p) => ({
          type: p.type,
          description: p.description.trim(),
          category_id: p.category_id || null,
          amount: p.amount,
          iva_rate: p.iva_rate,
          formalidade: p.formalidade,
          notes: p.notes || null,
        }));
        const { data, error } = await supabase.rpc("batch_insert_event_forecasts" as any, {
          _event_id: eventId,
          _version_id: selectedVersionId,
          _inserts: payload,
        } as any);
        if (error) throw error;
        insertedIds = ((data as any)?.ids ?? []) as string[];
      }

      let updated = 0;
      if (dirtyCount > 0) {
        const editsArr = Object.entries(dirty).map(([id, fields]) => ({ id, ...fields }));
        const { data, error } = await supabase.rpc("batch_update_event_forecasts" as any, {
          _event_id: eventId,
          _version_id: selectedVersionId,
          _edits: editsArr,
        } as any);
        if (error) throw error;
        updated = (data as any)?.updated ?? 0;
      }

      return { updated, inserted: insertedIds.length, insertedIds, undoSnapshots };
    },
    onSuccess: async (res) => {
      setDirty({});
      setPendingInserts([]);
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast({
        title: "BP guardado",
        description: `${res.inserted} inserida(s) · ${res.updated} atualizada(s).`,
      });

      // Post-save Undo (60s window) — reuses undo_actions infra
      if (user?.id && (res.undoSnapshots.length > 0 || res.insertedIds.length > 0)) {
        const undoRec = await recordUndo({
          action_type: "bp_grid_batch_save",
          entity_type: "event_forecast_batch",
          entity_id: null,
          payload: {
            eventId,
            snapshots: res.undoSnapshots,
            insertedIds: res.insertedIds,
          },
          description: `Grelha BP — ${res.inserted} inserida(s) + ${res.updated} atualizada(s)`,
          performed_by: user.id,
          performed_by_name: user.email ?? undefined,
        });
        if (undoRec) {
          showUndoToast({
            message: "BP guardado",
            description: "Toque em Desfazer nos próximos 60 segundos para reverter.",
            undoId: undoRec.id,
            user: { id: user.id, name: user.email ?? undefined },
            onUndone: () => {
              queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
            },
            durationMs: 60000,
          });
        }
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao guardar",
        description: err?.message ?? "A operação foi revertida.",
        variant: "destructive",
      });
    },
  });

  // --- DELETE selected (cascade check + trash) ---
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return { deleted: 0 };

      // Find linked transactions via event_forecasts.transaction_id (forward link).
      // A category-bound BP line can have multiple physical transactions sharing the same
      // category_id+event_id; we only block on the directly back-linked transaction(s).
      const { data: forecastRows } = (await supabase
        .from("event_forecasts")
        .select("id, transaction_id")
        .in("id", ids)) as { data: Array<{ id: string; transaction_id: string | null }> | null };

      const linkedTxIds = (forecastRows ?? [])
        .map((f) => f.transaction_id)
        .filter((x): x is string => !!x);

      let blockingCount = 0;
      if (linkedTxIds.length > 0) {
        const { data: txRows } = (await supabase
          .from("transactions")
          .select("id, status")
          .in("id", linkedTxIds)) as { data: Array<{ id: string; status: string }> | null };
        blockingCount = (txRows ?? []).filter((t) => t.status === "paid").length;
        if (blockingCount > 0) {
          throw new Error(
            `${blockingCount} transação(ões) já liquidada(s) impedem a eliminação. Estorne primeiro.`,
          );
        }
        // Cascade-delete non-paid linked transactions
        for (const tx of txRows ?? []) {
          await deleteTransactionCascade({
            transactionId: tx.id,
            user,
            auditReason: "Eliminada via grelha BP",
          });
        }
      }

      // Move each forecast to trash + delete
      let deleted = 0;
      for (const id of ids) {
        const { data: fc } = await supabase
          .from("event_forecasts")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (fc) {
          await moveToTrash({
            entity_type: "forecast",
            entity_id: id,
            entity_data: fc,
            deleted_by: user?.email || "sistema",
          });
        }
        const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
        if (error) throw error;
        deleted++;
      }
      return { deleted };
    },
    onSuccess: (res) => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast({ title: "Linhas eliminadas", description: `${res.deleted} linha(s) movida(s) para o lixo.` });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao eliminar",
        description: err?.message ?? "Não foi possível eliminar.",
        variant: "destructive",
      });
    },
  });

  const confirmAndDelete = useCallback(() => {
    if (selected.size === 0) return;
    if (window.confirm(`Eliminar ${selected.size} linha(s) do BP? Transações pendentes ligadas serão também eliminadas.`)) {
      deleteMutation.mutate();
    }
  }, [selected.size, deleteMutation]);

  // ⌘S / Ctrl+S → save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (hasUnsaved && !saveMutation.isPending) saveMutation.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasUnsaved, saveMutation]);

  // beforeunload guard
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  // --- MATRIX PASTE ---
  // When the user pastes TSV (or single value) into a text/number input,
  // detect multi-line content and fill the same column downward.
  const handlePaste = useCallback(
    (
      e: React.ClipboardEvent<HTMLInputElement>,
      rowIndex: number,
      field: "description" | "amount" | "iva_rate" | "notes",
    ) => {
      const text = e.clipboardData.getData("text");
      if (!text) return;
      // Quick exit for single-cell paste — let the native input handle it
      if (!text.includes("\n") && !text.includes("\t")) return;
      e.preventDefault();

      const matrix = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0).map((l) => l.split("\t"));
      if (matrix.length === 0) return;

      // Fill downward, one column = first column of TSV (we only support 1 column matrix paste for safety)
      let i = rowIndex;
      const dirtyUpdates: { id: string; field: typeof field; value: any; original: any }[] = [];

      for (const cols of matrix) {
        if (i >= sortedEditableRows.length) break;
        const row = sortedEditableRows[i];
        const lock = isRowLocked(row, canEditBP);
        if (lock.locked) {
          i++;
          continue;
        }
        const raw = (cols[0] ?? "").trim();
        let value: any = raw;
        if (field === "amount" || field === "iva_rate") {
          const n = parseFloat(raw.replace(",", "."));
          if (!Number.isFinite(n)) {
            i++;
            continue;
          }
          value = field === "iva_rate" ? Math.round(n) : n;
        }
        dirtyUpdates.push({ id: row.id, field, value, original: (row as any)[field] });
        i++;
      }

      // Apply in one state update
      setDirty((prev) => {
        const next = { ...prev };
        for (const u of dirtyUpdates) {
          const cur = { ...(next[u.id] ?? {}) };
          if ((u.value ?? null) === (u.original ?? null)) delete (cur as any)[u.field];
          else (cur as any)[u.field] = u.value;
          if (Object.keys(cur).length === 0) delete next[u.id];
          else next[u.id] = cur;
        }
        return next;
      });

      toast({
        title: "Colado",
        description: `${dirtyUpdates.length} célula(s) preenchida(s) na coluna.`,
      });
    },
    [sortedEditableRows, canEditBP],
  );

  // Virtualization (variable size: 32px for L1/L2 headers, 56px for editable rows)
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: gridItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (gridItems[i]?.kind === "header" ? 32 : 56),
    overscan: 8,
  });

  if (editableRows.length === 0 && pendingInserts.length === 0) {
    return (
      <div className="space-y-3">
        <Toolbar
          editableCount={0}
          dirtyCount={0}
          insertCount={0}
          totalErrors={0}
          selectedCount={0}
          canEditBP={canEditBP}
          isSaving={false}
          isDeleting={false}
          onAdd={addPending}
          onDeleteSelected={confirmAndDelete}
          onSave={() => saveMutation.mutate()}
          onDiscard={discardAll}
        />
        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
          Nenhuma linha editável neste evento. Use <strong>+ Receita</strong> ou <strong>+ Despesa</strong> para criar.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Toolbar
        editableCount={editableRows.length}
        dirtyCount={dirtyCount}
        insertCount={insertCount}
        totalErrors={totalErrors}
        selectedCount={selected.size}
        canEditBP={canEditBP}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
        onAdd={addPending}
        onDeleteSelected={confirmAndDelete}
        onSave={() => saveMutation.mutate()}
        onDiscard={discardAll}
      />

      {/* Header (sem coluna Tipo: inferida pela categoria) */}
      <div className="grid w-full grid-cols-[20px_16px_minmax(180px,2fr)_minmax(140px,1.5fr)_96px_56px_104px_28px_28px] gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>
          <input
            type="checkbox"
            disabled={!canEditBP || sortedEditableRows.length === 0}
            checked={selected.size > 0 && selected.size === sortedEditableRows.filter((r) => !isRowLocked(r, canEditBP).locked).length}
            onChange={(e) => {
              if (e.target.checked) {
                setSelected(new Set(sortedEditableRows.filter((r) => !isRowLocked(r, canEditBP).locked).map((r) => r.id)));
              } else {
                setSelected(new Set());
              }
            }}
          />
        </div>
        <div />
        <div>Categoria (L3)</div>
        <div>Descrição</div>
        <div className="text-right">Valor</div>
        <div className="text-right">IVA %</div>
        <div>Formalidade</div>
        <div className="text-center" title="Notas">N</div>
        <div />
      </div>

      {/* Pending inserts — rendered ABOVE existing rows so new entries are visible without scrolling */}
      {pendingInserts.length > 0 && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 py-2">
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Novas linhas ({pendingInserts.length}) — guardar para confirmar
          </div>
          {pendingInserts.map((p) => {
            const errs = pendingErrors.get(p.tempId) ?? {};
            const opts = l3CategoriesByType[p.type] ?? [];
            const notesVal = p.notes || "";
            return (
              <div
                key={p.tempId}
                data-pending-temp-id={p.tempId}
                className="grid w-full grid-cols-[20px_16px_minmax(180px,2fr)_minmax(140px,1.5fr)_96px_56px_104px_28px_28px] items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <div />
                <div />
                <div className="min-w-0">
                  <SearchableSelect
                    value={p.category_id ?? ""}
                    onValueChange={(v: string) => updatePending(p.tempId, "category_id", v || null)}
                    options={opts}
                    placeholder="Selecionar L3…"
                  />
                  {errs.category_id && (
                    <span className="mt-0.5 block text-[10px] text-destructive">{errs.category_id}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <input
                    type="text"
                    data-pending-desc-input
                    value={p.description}
                    onChange={(e) => updatePending(p.tempId, "description", e.target.value)}
                    placeholder={`${p.type === "income" ? "Receita" : "Despesa"} — descrição*`}
                    className={`w-full rounded-md border bg-background px-2 py-1 text-xs ${
                      errs.description ? "border-destructive" : "border-border/60"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <AmountCell
                    value={p.amount}
                    onCommit={(n) => updatePending(p.tempId, "amount", n)}
                    hasError={!!errs.amount}
                  />
                </div>
                <div>
                  <select
                    value={p.iva_rate}
                    onChange={(e) => updatePending(p.tempId, "iva_rate", parseInt(e.target.value))}
                    className="w-full rounded-md border border-border/60 bg-background px-1.5 py-1 text-right text-xs"
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
                    value={p.formalidade}
                    onChange={(e) => updatePending(p.tempId, "formalidade", e.target.value)}
                    className="w-full rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs"
                  >
                    {FORMALIDADE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title={notesVal ? notesVal.slice(0, 120) : "Adicionar notas"}
                        className={`rounded p-1 transition-colors ${
                          notesVal ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="left" align="start" className="w-72 p-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notas</p>
                      <Textarea
                        value={notesVal}
                        onChange={(e) => updatePending(p.tempId, "notes", e.target.value)}
                        rows={4}
                        placeholder="Notas internas…"
                        className="text-xs"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removePending(p.tempId)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remover esta linha pendente"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Virtualized list — interleaves L1/L2 group headers and editable rows */}
      <div
        ref={parentRef}
        className="max-h-[600px] overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-background/40"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtual) => {
            const item = gridItems[virtual.index];
            if (!item) return null;

            // ── Group header (L1/L2) ──
            if (item.kind === "header") {
              const isL1 = item.level === 1;
              return (
                <div
                  key={item.key}
                  data-index={virtual.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtual.start}px)`,
                    height: 32,
                  }}
                  className={`flex items-center border-b border-border/40 px-3 ${
                    isL1
                      ? "bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-foreground"
                      : "bg-muted/30 pl-7 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  }`}
                >
                  <span>{item.code} · {item.name}</span>
                </div>
              );
            }

            // ── Editable forecast row ──
            const row = item.row;
            const lock = isRowLocked(row, canEditBP);
            const rowDirty = dirty[row.id] ?? {};
            const errs = rowErrors.get(row.id) ?? {};
            const isSelected = selected.has(row.id);
            const currentVal = (field: EditableField, fallback: any) =>
              field in rowDirty ? rowDirty[field] : fallback;

            const opts = l3CategoriesByType[row.type] ?? [];
            const code = categoryCodeById.get(row.category_id ?? "") ?? "";
            const depth = code ? Math.max(0, code.split(".").length - 1) : 0;
            const indentPx = Math.min(depth, 3) * 12;
            const notesVal = (currentVal("notes", row.notes ?? "") as string) || "";

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
                className={`grid w-full grid-cols-[20px_16px_minmax(180px,2fr)_minmax(140px,1.5fr)_96px_56px_104px_28px_28px] items-center gap-1.5 border-b border-border/40 px-3 py-2 text-xs ${
                  Object.keys(rowDirty).length > 0 ? "bg-primary/5" : ""
                } ${isSelected ? "bg-destructive/5" : ""}`}
              >
                <div>
                  <input
                    type="checkbox"
                    disabled={lock.locked}
                    checked={isSelected}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(row.id);
                        else n.delete(row.id);
                        return n;
                      });
                    }}
                  />
                </div>
                <div title={lock.reason ?? ""}>
                  {lock.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="min-w-0" style={{ paddingLeft: indentPx }}>
                  <SearchableSelect
                    value={currentVal("category_id", row.category_id ?? "")}
                    onValueChange={(v: string) => updateField(row.id, "category_id", v || null, row.category_id)}
                    options={opts}
                    placeholder="Selecionar L3…"
                    disabled={lock.locked}
                  />
                  {errs.category_id && (
                    <span className="mt-0.5 block text-[10px] text-destructive">{errs.category_id}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <input
                    type="text"
                    disabled={lock.locked}
                    value={currentVal("description", row.description ?? "")}
                    onChange={(e) => updateField(row.id, "description", e.target.value, row.description)}
                    onPaste={(e) => handlePaste(e, item.rowIndex, "description")}
                    className={`w-full rounded-md border bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                      errs.description ? "border-destructive" : "border-border/60"
                    }`}
                    title={errs.description ?? ""}
                  />
                </div>
                <div className="min-w-0">
                  <AmountCell
                    value={Number(currentVal("amount", row.amount ?? 0))}
                    onCommit={(n) => updateField(row.id, "amount", n, Number(row.amount))}
                    onPaste={(e) => handlePaste(e, item.rowIndex, "amount")}
                    disabled={lock.locked}
                    hasError={!!errs.amount}
                    title={errs.amount ?? ""}
                  />
                </div>
                <div>
                  <select
                    disabled={lock.locked}
                    value={currentVal("iva_rate", row.iva_rate ?? 23)}
                    onChange={(e) => updateField(row.id, "iva_rate", parseInt(e.target.value), row.iva_rate)}
                    className={`w-full rounded-md border bg-background px-1.5 py-1 text-right text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                      errs.iva_rate ? "border-destructive" : "border-border/60"
                    }`}
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
                    className="w-full rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {FORMALIDADE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={lock.locked}
                        title={notesVal ? notesVal.slice(0, 120) : "Adicionar notas"}
                        className={`rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          notesVal ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="left" align="start" className="w-72 p-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notas</p>
                      <Textarea
                        value={notesVal}
                        disabled={lock.locked}
                        onChange={(e) => updateField(row.id, "notes", e.target.value, row.notes ?? "")}
                        rows={4}
                        placeholder="Notas internas…"
                        className="text-xs"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div />
              </div>
            );
          })}
        </div>
      </div>



      <p className="text-[11px] text-muted-foreground">
        Fase A.2 — edição, criação e eliminação em lote. Cole TSV (Excel/Sheets) numa célula para preencher a coluna para baixo. Atalho:{" "}
        <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘S</kbd> para guardar.
      </p>
    </div>
  );
}

function Toolbar(props: {
  editableCount: number;
  dirtyCount: number;
  insertCount: number;
  totalErrors: number;
  selectedCount: number;
  canEditBP: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onAdd: (type: "income" | "expense") => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const {
    editableCount,
    dirtyCount,
    insertCount,
    totalErrors,
    selectedCount,
    canEditBP,
    isSaving,
    isDeleting,
    onAdd,
    onDeleteSelected,
    onSave,
    onDiscard,
  } = props;
  const hasUnsaved = dirtyCount > 0 || insertCount > 0;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          {editableCount} linha(s) · {dirtyCount} edição(ões) · {insertCount} nova(s)
        </span>
        {totalErrors > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" />
            {totalErrors} erro(s)
          </span>
        )}
        {hasUnsaved && totalErrors === 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Alterações não guardadas
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onAdd("income")}
          disabled={!canEditBP}
          className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/5 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Receita
        </button>
        <button
          type="button"
          onClick={() => onAdd("expense")}
          disabled={!canEditBP}
          className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning/5 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Despesa
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar ({selectedCount})
          </button>
        )}
        {hasUnsaved && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Desfazer alterações
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!hasUnsaved || isSaving || totalErrors > 0}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          title="⌘S / Ctrl+S"
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving
            ? "A guardar…"
            : hasUnsaved
              ? `Guardar (${dirtyCount + insertCount})`
              : "Guardado"}
        </button>
      </div>
    </div>
  );
}
