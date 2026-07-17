/**
 * BP Univer Spike — Fase 2: persistência na BD com validação, undo, rascunho.
 *
 * Modelo: editar em memória → validar → GRAVAR explicitamente (não é auto-save).
 * - Alterações acumuladas em `dirty` (existentes), `pendingInserts` (novas), `pendingDeletes`.
 * - Botão GRAVAR chama RPCs `batch_update_event_forecasts` + `batch_insert_event_forecasts`
 *   (já existentes em produção) e delete direto para remoções.
 * - Undo: Ctrl/Cmd+Z do Univer é nativo para células; botão dispara o mesmo comando.
 *   Inserir/apagar linha têm undo lógico próprio ("Desfazer última ação").
 * - Rascunho local em localStorage (`bp-univer-draft:${eventId}:${userId}`): guardado
 *   a cada alteração e oferecido para recuperar ao abrir a página; limpo ao gravar.
 * - Aviso ao sair: beforeunload nativo + intercepção do botão back via popstate.
 *   (Navegação interna via <Link> não é intercetada nesta versão — limitação reportada.)
 * - Linhas novas gravam como status='draft'. O spike passou a carregar draft+approved
 *   (senão desapareceriam ao recarregar). REPORTAR ao Pedro.
 *
 * ⚠️ DO NOT import from production code. Route: /admin/bp-univer-spike (admin only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Save, Trash2, Plus, Undo2, AlertTriangle } from "lucide-react";
import { compareHierarchicalCodes } from "@/lib/utils";
import { buildCategoryLookup, type CategoryLookup } from "@/lib/category-hierarchy";
import { toast } from "sonner";
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
// (modal de "Nova linha" removido — inserção passou a ser inline na grelha)

import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import sheetsCorePtBR from "@univerjs/preset-sheets-core/locales/pt-BR";
import "@univerjs/preset-sheets-core/lib/index.css";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import "@univerjs/preset-sheets-data-validation/lib/index.css";

const DEFAULT_EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA 2026 (fallback sandbox)
const VALID_IVA = [0, 6, 13, 23] as const;

// Formalidade: enum ↔ label
const FORMALIDADE_OPTIONS: { value: string; label: string }[] = [
  { value: "estimado", label: "Estimado" },
  { value: "negociacao", label: "Em Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "pago_parcial", label: "Pago Parcial" },
  { value: "pago_total", label: "Pago Total" },
];
const FORMALIDADE_LABELS = FORMALIDADE_OPTIONS.map((o) => o.label);

const normalizeLookupKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formalidadeLookup = new Map<string, string>();
for (const option of FORMALIDADE_OPTIONS) {
  formalidadeLookup.set(normalizeLookupKey(option.value), option.value);
  formalidadeLookup.set(normalizeLookupKey(option.label), option.value);
}

const enumToLabel = (v: string | null | undefined) =>
  FORMALIDADE_OPTIONS.find((o) => o.value === v)?.label ?? "";
const labelToEnum = (l: string | null | undefined) => {
  const raw = l == null ? "" : String(l).trim();
  if (!raw) return null;
  return FORMALIDADE_OPTIONS.find((o) => o.label === raw || o.value === raw)?.value
    ?? formalidadeLookup.get(normalizeLookupKey(raw))
    ?? null;
};

const addLookupAlias = (map: Map<string, string>, alias: unknown, id: string) => {
  const raw = alias == null ? "" : String(alias).trim();
  if (!raw) return;
  map.set(raw, id);
  map.set(normalizeLookupKey(raw), id);
};

const normalizeCategoryEditValue = (value: unknown, categoryLabelToId: Map<string, string>) => {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return null;
  return categoryLabelToId.get(raw) ?? categoryLabelToId.get(normalizeLookupKey(raw)) ?? raw;
};

const resolveCategoryEditValue = (
  value: unknown,
  originalCategoryId: string | null | undefined,
  categoryIdToLabel: Map<string, string>,
  categoryLabelToId: Map<string, string>,
) => {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return null;

  // A célula mostra label, mas a BD guarda UUID. Se existirem labels iguais
  // (multi-empresa/categorias duplicadas), preservar o ID original quando o
  // texto visível é exatamente o mesmo evita dirty fantasma por colisão de map.
  if (originalCategoryId) {
    const originalLabel = categoryIdToLabel.get(originalCategoryId);
    if (
      raw === originalCategoryId ||
      (originalLabel && normalizeLookupKey(raw) === normalizeLookupKey(originalLabel))
    ) {
      return originalCategoryId;
    }
  }

  return normalizeCategoryEditValue(raw, categoryLabelToId);
};

const normalizeFormalidadeEditValue = (value: unknown) => {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return null;
  return labelToEnum(raw) ?? raw;
};

interface Entry {
  id: string;
  company_id?: string;
  category_id: string | null;
  description: string | null;
  specification: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string | null;
  status?: string;
}

interface InsertRow {
  tempId: string;
  category_id: string | null;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string;
}

type RowKind = "header" | "grand" | "l1" | "l2" | "l3" | "entry";

interface BuiltRow {
  kind: RowKind;
  label: string;
  entry?: Entry & { __insertTempId?: string };
  childRows?: number[];
  indent: number;
}

// Column indexes
const COL = {
  RUBRIC: 0,
  CATEGORY: 1,
  SPEC: 2,
  AMOUNT: 3,
  IVA: 4,
  TOTAL: 5,
  FORMALIDADE: 6,
};
const N_COLS = 7;
const colLetter = (c: number) => String.fromCharCode(65 + c);
const L_AMOUNT = colLetter(COL.AMOUNT);
const L_IVA = colLetter(COL.IVA);
const L_TOTAL = colLetter(COL.TOTAL);

type UniverRange = { startRow: number; endRow: number; startColumn: number; endColumn: number };

const PROTECTED_CELL_TOAST = "Esta célula é calculada e não pode ser editada";
const INSERTED_CATEGORY_TOAST = "A categoria é herdada do grupo onde a linha foi criada.";
const EDIT_BLOCK_COMMANDS = new Set([
  "sheet.operation.set-cell-edit-visible",
  "sheet.operation.set-cell-edit-visible-f2",
  "sheet.operation.set-cell-edit-visible-arrow",
  "sheet.operation.set-activate-cell-edit",
]);
const RANGE_WRITE_COMMANDS = new Set([
  "sheet.command.set-range-values",
  "sheet.command.clear-selection-all",
  "sheet.command.clear-selection-content",
  "sheet.command.clear-selection-format",
  "sheet.command.paste",
  "sheet.command.paste-value",
  "sheet.command.paste-format",
  "sheet.command.paste-col-width",
  "sheet.command.paste-besides-border",
  "sheet.command.optional-paste",
  "sheet.command.auto-fill",
  "sheet.command.auto-clear-content",
  "sheet.command.refill",
  "sheet.command.copy-down",
  "sheet.command.copy-right",
]);

const USER_ACTION_COMMANDS = new Set([
  ...EDIT_BLOCK_COMMANDS,
  ...RANGE_WRITE_COMMANDS,
]);

const normalizeRange = (range: any): UniverRange | null => {
  const raw = typeof range?.getRange === "function" ? range.getRange() : range;
  if (!raw) return null;
  const startRow = raw.startRow ?? raw.row ?? raw.actualRow;
  const startColumn = raw.startColumn ?? raw.column ?? raw.col ?? raw.actualColumn;
  if (typeof startRow !== "number" || typeof startColumn !== "number") return null;
  const endRow = raw.endRow ?? (typeof raw.numRows === "number" ? startRow + raw.numRows - 1 : startRow);
  const endColumn = raw.endColumn ?? (typeof raw.numColumns === "number" ? startColumn + raw.numColumns - 1 : startColumn);
  return { startRow, endRow, startColumn, endColumn };
};

const rangeHitsProtectedCell = (range: UniverRange, protectedCells: Set<string>) => {
  const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
  const endRow = Math.max(range.startRow, range.endRow);
  const startColumn = Math.max(0, Math.min(range.startColumn, range.endColumn));
  const endColumn = Math.max(range.startColumn, range.endColumn);
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startColumn; c <= endColumn; c++) {
      if (protectedCells.has(`${r},${c}`)) return true;
    }
  }
  return false;
};

const matrixHitsProtectedCell = (matrix: any, protectedCells: Set<string>) => {
  if (!matrix || typeof matrix !== "object") return false;
  for (const [rowKey, rowValue] of Object.entries(matrix)) {
    if (!rowValue || typeof rowValue !== "object") continue;
    for (const colKey of Object.keys(rowValue as Record<string, unknown>)) {
      if (protectedCells.has(`${Number(rowKey)},${Number(colKey)}`)) return true;
    }
  }
  return false;
};

const getCommandCellValueMatrix = (params: any) => {
  if (params?.cellValue && typeof params.cellValue === "object") return params.cellValue;
  const range = normalizeRange(params?.range);
  if (!range || params?.value === undefined) return null;
  const matrix: Record<number, Record<number, unknown>> = {};
  const value = params.value;
  if (value && typeof value === "object" && !("v" in value)) {
    const maybeMatrix = value as Record<string, unknown>;
    if (Object.keys(maybeMatrix).some((key) => /^\d+$/.test(key))) return maybeMatrix;
  }
  for (let r = range.startRow; r <= range.endRow; r++) {
    matrix[r] = matrix[r] ?? {};
    for (let c = range.startColumn; c <= range.endColumn; c++) matrix[r][c] = value;
  }
  return matrix;
};

const getCellValuePayload = (cell: any) =>
  cell && typeof cell === "object" && "v" in cell ? cell.v : cell;

const compactRowsToRanges = (rows: number[], col: number, width: number) => {
  const sorted = Array.from(new Set(rows)).sort((a, b) => a - b);
  const ranges: UniverRange[] = [];
  for (const row of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.endRow + 1 === row) {
      last.endRow = row;
    } else {
      ranges.push({ startRow: row, endRow: row, startColumn: col, endColumn: col + width - 1 });
    }
  }
  return ranges;
};

// ---- Utility: parse amount string (accepts "1.234,56" or "1234.56") ----
const parseAmount = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[\s€]/g, "");
  if (!s) return null;
  // If contains comma, PT-style: dots are thousands and comma is decimal.
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return isFinite(n) ? n : null;
};

const parseIntSafe = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? Math.round(v) : null;
  const normalized = String(v).trim().replace(/[\s%]/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return isFinite(n) ? Math.round(n) : null;
};

type DraftPayload = {
  savedAt?: string;
  edits?: Record<string, Partial<Entry>>;
  inserts?: InsertRow[];
  deletes?: string[];
};

type DraftSanitizeResult = {
  draft: DraftPayload;
  converted: number;
  removed: number;
};

const normalizeDraftAmount = (value: unknown) => {
  const parsed = parseAmount(value);
  return parsed === null || !isFinite(parsed) ? null : parsed;
};

const normalizeDraftIva = (value: unknown) => {
  const parsed = parseIntSafe(value);
  return parsed === null || !isFinite(parsed) || parsed < 0 ? null : parsed;
};

const sanitizeDraftPayload = (rawDraft: any): DraftSanitizeResult => {
  const raw = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  let converted = 0;
  let removed = 0;

  const edits: Record<string, Partial<Entry>> = {};
  const rawEdits = raw.edits && typeof raw.edits === "object" ? raw.edits : {};
  for (const [id, rawDelta] of Object.entries(rawEdits)) {
    if (!rawDelta || typeof rawDelta !== "object") {
      removed++;
      continue;
    }
    const delta = rawDelta as Record<string, unknown>;
    const clean: Partial<Entry> = {};
    for (const [field, value] of Object.entries(delta)) {
      if (field === "amount") {
        const parsed = normalizeDraftAmount(value);
        if (parsed === null) { removed++; continue; }
        if (typeof value !== "number" || value !== parsed) converted++;
        clean.amount = parsed;
      } else if (field === "iva_rate") {
        const parsed = normalizeDraftIva(value);
        if (parsed === null) { removed++; continue; }
        if (typeof value !== "number" || value !== parsed) converted++;
        clean.iva_rate = parsed;
      } else if (field === "category_id") {
        clean.category_id = value == null || value === "" ? null : String(value);
      } else if (field === "description") {
        clean.description = value == null ? "" : String(value);
      } else if (field === "specification") {
        clean.specification = value == null || value === "" ? null : String(value);
      } else if (field === "formalidade") {
        clean.formalidade = value == null || value === "" ? null : String(value);
      }
    }
    if (Object.keys(clean).length) edits[id] = clean;
  }

  const inserts: InsertRow[] = [];
  const rawInserts = Array.isArray(raw.inserts) ? raw.inserts : [];
  for (const rawInsert of rawInserts) {
    if (!rawInsert || typeof rawInsert !== "object") {
      removed++;
      continue;
    }
    const row = rawInsert as Record<string, unknown>;
    const amount = normalizeDraftAmount(row.amount);
    const iva = normalizeDraftIva(row.iva_rate);
    if (amount === null || iva === null) {
      removed++;
      continue;
    }
    if (typeof row.amount !== "number" || row.amount !== amount) converted++;
    if (typeof row.iva_rate !== "number" || row.iva_rate !== iva) converted++;
    inserts.push({
      tempId: typeof row.tempId === "string" && row.tempId ? row.tempId : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category_id: row.category_id == null || row.category_id === "" ? null : String(row.category_id),
      description: row.description == null ? "" : String(row.description),
      specification: row.specification == null || row.specification === "" ? null : String(row.specification),
      amount,
      iva_rate: iva,
      formalidade: row.formalidade == null || row.formalidade === "" ? "estimado" : String(row.formalidade),
    });
  }

  return {
    draft: {
      savedAt: typeof raw.savedAt === "string" ? raw.savedAt : undefined,
      edits,
      inserts,
      deletes: Array.isArray(raw.deletes) ? raw.deletes.filter((id: unknown): id is string => typeof id === "string") : [],
    },
    converted,
    removed,
  };
};

const normalizeComparableText = (value: unknown) => {
  if (value == null || value === "") return null;
  return String(value)
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const entryFieldEquals = (originalValue: unknown, nextValue: unknown) => {
  if (typeof originalValue === "number" || typeof nextValue === "number") {
    const o = Number(originalValue);
    const n = Number(nextValue);
    return isFinite(o) && isFinite(n) && Math.abs(o - n) < 1e-6;
  }
  return normalizeComparableText(originalValue) === normalizeComparableText(nextValue);
};

const mergeDirtyEdits = (
  current: Record<string, Partial<Entry>>,
  deltaById: Record<string, Partial<Entry>>,
  originals: Map<string, Entry>,
  categoryLabelToId: Map<string, string>,
) => {
  const next: Record<string, Partial<Entry>> = { ...current };

  for (const [id, delta] of Object.entries(deltaById)) {
    const original = originals.get(id);
    if (!original) continue;
    const rowDelta: Partial<Entry> = { ...(next[id] ?? {}) };

    for (const field of Object.keys(delta) as (keyof Entry)[]) {
      const value = (delta as any)[field];
      if (entryFieldEquals((original as any)[field], value)) delete (rowDelta as any)[field];
      else (rowDelta as any)[field] = value;
    }

    if (Object.keys(rowDelta).length) next[id] = rowDelta;
    else delete next[id];
  }

  const { edits: normalized } = normalizeRecoveredEditValues(next, categoryLabelToId);
  return pruneNoOpEdits(normalized, originals).edits;
};

const pruneNoOpEdits = (edits: Record<string, Partial<Entry>>, originals: Map<string, Entry>) => {
  if (!originals.size) return { edits, prunedRows: 0, prunedFields: 0 };
  let prunedRows = 0;
  let prunedFields = 0;
  let changed = false;
  const cleanEdits: Record<string, Partial<Entry>> = {};

  for (const [id, delta] of Object.entries(edits ?? {})) {
    const original = originals.get(id);
    if (!original) {
      cleanEdits[id] = delta;
      continue;
    }
    const clean: Partial<Entry> = {};
    for (const key of Object.keys(delta) as (keyof Entry)[]) {
      if (entryFieldEquals((original as any)[key], (delta as any)[key])) {
        prunedFields++;
        changed = true;
      } else {
        (clean as any)[key] = (delta as any)[key];
      }
    }
    if (Object.keys(clean).length) cleanEdits[id] = clean;
    else {
      prunedRows++;
      changed = true;
    }
  }

  return { edits: changed ? cleanEdits : edits, prunedRows, prunedFields };
};

const normalizeRecoveredEditValues = (
  edits: Record<string, Partial<Entry>>,
  categoryLabelToId: Map<string, string>,
) => {
  let normalizedFields = 0;
  let changed = false;
  const cleanEdits: Record<string, Partial<Entry>> = {};

  for (const [id, delta] of Object.entries(edits ?? {})) {
    const clean: Partial<Entry> = { ...delta };

    if (Object.prototype.hasOwnProperty.call(clean, "category_id")) {
      const raw = (clean as any).category_id;
      const normalized = normalizeCategoryEditValue(raw, categoryLabelToId);
      if (!entryFieldEquals(raw, normalized)) {
        normalizedFields++;
        changed = true;
      }
      clean.category_id = normalized;
    }

    if (Object.prototype.hasOwnProperty.call(clean, "formalidade")) {
      const raw = (clean as any).formalidade;
      const normalized = normalizeFormalidadeEditValue(raw);
      if (!entryFieldEquals(raw, normalized)) {
        normalizedFields++;
        changed = true;
      }
      clean.formalidade = normalized;
    }

    if (Object.keys(clean).length) cleanEdits[id] = clean;
  }

  return { edits: changed ? cleanEdits : edits, normalizedFields };
};

const draftRemovalMessage = (count: number) =>
  `${count} edição${count === 1 ? " inválida foi removida" : "ões inválidas foram removidas"} do rascunho.`;

interface BPUniverSpikeProps {
  eventId?: string;
  canEdit?: boolean;
  embedded?: boolean;
}

export default function BPUniverSpike({ eventId: eventIdProp, canEdit, embedded = false }: BPUniverSpikeProps = {}) {
  const { role, user } = useAuth();
  // Standalone: aceita ?event=<uuid> no URL; fallback = Anitta EDA 2026.
  const urlParams = !embedded && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const urlEventId = !eventIdProp ? urlParams?.get("event") ?? undefined : undefined;
  const EVENT_ID = eventIdProp ?? urlEventId ?? DEFAULT_EVENT_ID;
  const [eventName, setEventName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);
  const univerRef = useRef<any>(null);
  const protectedCellsRef = useRef<Set<string>>(new Set());
  const protectedRowsRef = useRef<number[]>([]);
  const protectedFormulaRowsRef = useRef<number[]>([]);
  const originalFormulasRef = useRef<Map<string, string>>(new Map());
  const entryRowsRef = useRef<number[]>([]);
  const rowToEntryIdRef = useRef<Map<number, string>>(new Map());
  const entryIdToRowRef = useRef<Map<string, number>>(new Map());
  const insertRowToTempIdRef = useRef<Map<number, string>>(new Map());
  const insertedCategoryCellsRef = useRef<Set<string>>(new Set());
  const originalEntriesRef = useRef<Map<string, Entry>>(new Map());
  const categoryLabelToIdRef = useRef<Map<string, string>>(new Map());
  const categoryIdToLabelRef = useRef<Map<string, string>>(new Map());
  const categoryDropdownRef = useRef<string[]>([]);
  const selectionRangesRef = useRef<UniverRange[]>([]);
  const toastThrottleRef = useRef(0);
  const dvRafRef = useRef<number | null>(null);
  const domProtectionCleanupRef = useRef<null | (() => void)>(null);
  const numericSweepRafRef = useRef<number | null>(null);
  // Flag ligada durante escritas programáticas (sweep, replay de rascunho,
  // recálculo de F). handleCommandExecuted ignora comandos disparados enquanto
  // este flag está true — assim edições fantasma (writes internos) não entram no dirty.
  const isProgrammaticWriteRef = useRef(false);
  const nextInsertRowRef = useRef<number>(0);
  const sheetRowCountRef = useRef<number>(200);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // --- Fase 2 state ---
  const [dirty, setDirty] = useState<Record<string, Partial<Entry>>>({});
  const [pendingInserts, setPendingInserts] = useState<InsertRow[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    { row: number; entryLabel: string; problems: string[] }[]
  >([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string; amount: number } | null>(null);
  // (modal "Nova linha" e newRowDraft removidos — inserção passou a ser inline)
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [draftPromptMeta, setDraftPromptMeta] = useState<{ savedAt: string; edits: number; inserts: number; deletes: number } | null>(null);
  const pendingDraftRef = useRef<any>(null);
  const [actionLog, setActionLog] = useState<Array<{ kind: "insert" | "delete" | "edit"; data: any }>>([]);
  const [pendingNavConfirm, setPendingNavConfirm] = useState<null | (() => void)>(null);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [focusInsertTempId, setFocusInsertTempId] = useState<string | null>(null);

  const categoryLabelLookup = useMemo(() => {
    const map = new Map<string, string>();
    const byId: Record<string, any> = {};
    categories.forEach((c) => { if (c?.id) byId[c.id] = c; });
    for (const c of categories) {
      if (!c?.id) continue;
      const p = c.parent_id ? byId[c.parent_id] : null;
      const gp = p?.parent_id ? byId[p.parent_id] : null;
      if (!gp || !(c.type === "expense" || gp.type === "expense")) continue;
      addLookupAlias(map, c.id, c.id);
      if (c?.code) addLookupAlias(map, c.code, c.id);
      if (c?.code && c?.name) {
        addLookupAlias(map, `${c.code} · ${c.name}`, c.id);
        addLookupAlias(map, `${c.code} - ${c.name}`, c.id);
        addLookupAlias(map, `${c.code} – ${c.name}`, c.id);
        addLookupAlias(map, `${c.code} — ${c.name}`, c.id);
      }
    }
    return map;
  }, [categories]);

  const effectiveDirtyForCount = useMemo(() => {
    const normalized = normalizeRecoveredEditValues(dirty, categoryLabelLookup);
    return pruneNoOpEdits(normalized.edits, originalEntriesRef.current).edits;
  }, [dirty, categoryLabelLookup, entries]);

  const changeCount = Object.keys(effectiveDirtyForCount).length + pendingInserts.length + pendingDeletes.length;
  const hasChanges = changeCount > 0;

  // Ref para o dirty atual — usado no efeito de reaplicação (evita re-fire por keystroke)
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    console.debug(
      "[BPUniverSpike] dirty:",
      {
        edits: Object.entries(effectiveDirtyForCount).map(([id, d]) => ({ id, campos: Object.keys(d) })),
        inserts: pendingInserts.map((row) => row.tempId),
        deletes: pendingDeletes,
        total: changeCount,
      },
    );
  }, [changeCount, effectiveDirtyForCount, pendingInserts, pendingDeletes]);

  // Escape to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!ready) return;
    const raf1 = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      const raf2 = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      (window as any).__univerResizeRaf = raf2;
    });
    return () => cancelAnimationFrame(raf1);
  }, [fullscreen, ready]);

  const isAdmin = role === "admin" || role === "platform_admin";
  const allowed = embedded ? (canEdit ?? true) : isAdmin;
  const userId = user?.id ?? "anon";
  const draftKey = `bp-univer-draft:${EVENT_ID}:${userId}`;

  // Load data (loads draft+approved so newly-inserted draft rows persist across reloads)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const eRes = await supabase
        .from("events")
        .select("name, company_id")
        .eq("id", EVENT_ID)
        .maybeSingle();
      if (eRes.error) throw eRes.error;

      const eventCompanyId = (eRes.data as any)?.company_id ?? null;
      const categoryQuery = supabase
        .from("account_categories")
        .select("id, name, code, parent_id, type, company_id");

      const [fRes, cRes] = await Promise.all([
        supabase
          .from("event_forecasts")
          .select("id, company_id, category_id, description, specification, amount, iva_rate, formalidade, status")
          .eq("event_id", EVENT_ID)
          .is("version_id", null)
          .in("status", ["approved", "draft"])
          .eq("type", "expense"),
        eventCompanyId ? categoryQuery.eq("company_id", eventCompanyId) : categoryQuery,
      ]);
      if (fRes.error) throw fRes.error;
      if (cRes.error) throw cRes.error;
      setEntries((fRes.data ?? []) as Entry[]);
      setCategories(cRes.data ?? []);
      setEventName((eRes.data as any)?.name ?? null);
      // Original snapshot
      const map = new Map<string, Entry>();
      for (const e of (fRes.data ?? []) as Entry[]) map.set(e.id, e);
      originalEntriesRef.current = map;
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [EVENT_ID]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Draft recovery prompt on mount (after data loads)
  useEffect(() => {
    if (loading || !entries.length) return;
    if (pendingDraftRef.current !== null) return; // already handled
    pendingDraftRef.current = "checked";
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const { draft: sanitized, converted, removed } = sanitizeDraftPayload(parsed);
      const { edits: normalizedEdits, normalizedFields } = normalizeRecoveredEditValues(sanitized.edits ?? {}, categoryLabelLookup);
      const { edits: cleanEdits, prunedRows, prunedFields } = pruneNoOpEdits(normalizedEdits, originalEntriesRef.current);
      sanitized.edits = cleanEdits;
      const editsN = Object.keys(sanitized.edits ?? {}).length;
      const insertsN = (sanitized.inserts ?? []).length;
      const deletesN = (sanitized.deletes ?? []).length;
      if (editsN + insertsN + deletesN === 0) {
        localStorage.removeItem(draftKey);
        if (removed > 0) toast.warning(draftRemovalMessage(removed));
        return;
      }
      if (converted > 0 || removed > 0 || normalizedFields > 0 || prunedRows > 0 || prunedFields > 0) {
        localStorage.setItem(draftKey, JSON.stringify({ ...sanitized, savedAt: sanitized.savedAt ?? parsed.savedAt ?? new Date().toISOString() }));
        if (removed > 0) toast.warning(draftRemovalMessage(removed));
      }
      pendingDraftRef.current = sanitized;
      setDraftPromptMeta({ savedAt: sanitized.savedAt ?? parsed.savedAt ?? "?", edits: editsN, inserts: insertsN, deletes: deletesN });
      setDraftPromptOpen(true);
    } catch (e) {
      console.warn("[BPUniverSpike] draft parse failed", e);
    }
  }, [loading, entries.length, draftKey, categoryLabelLookup]);

  // Depois de os originais da BD chegarem, poda no-ops que possam ter entrado
  // antes do snapshot estar populado. Atualiza state e localStorage em conjunto.
  useEffect(() => {
    if (loading || !ready || !originalEntriesRef.current.size) return;
    const { edits: normalizedEdits, normalizedFields } = normalizeRecoveredEditValues(dirtyRef.current, categoryLabelLookup);
    const { edits: cleanEdits, prunedRows, prunedFields } = pruneNoOpEdits(normalizedEdits, originalEntriesRef.current);
    if (normalizedFields === 0 && prunedRows === 0 && prunedFields === 0) return;

    setDirty(cleanEdits);

    const nextHasChanges = Object.keys(cleanEdits).length + pendingInserts.length + pendingDeletes.length > 0;
    try {
      if (!nextHasChanges) {
        localStorage.removeItem(draftKey);
      } else {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            edits: cleanEdits,
            inserts: pendingInserts,
            deletes: pendingDeletes,
          }),
        );
      }
    } catch (e) {
      console.warn("[BPUniverSpike] draft prune save failed", e);
    }
  }, [loading, ready, entries, dirty, draftKey, pendingInserts, pendingDeletes, categoryLabelLookup]);

  // Persist draft to localStorage
  useEffect(() => {
    if (!ready) return;
    if (!hasChanges) {
      if (Object.keys(dirty).length) setDirty(effectiveDirtyForCount);
      try { localStorage.removeItem(draftKey); } catch { /* noop */ }
      return;
    }
    const { edits: normalizedEdits, normalizedFields } = normalizeRecoveredEditValues(dirty, categoryLabelLookup);
    const { edits: cleanEdits, prunedRows, prunedFields } = pruneNoOpEdits(normalizedEdits, originalEntriesRef.current);
    if (normalizedFields > 0 || prunedRows > 0 || prunedFields > 0) {
      setDirty(cleanEdits);
      const nextHasChanges = Object.keys(cleanEdits).length + pendingInserts.length + pendingDeletes.length > 0;
      try {
        if (!nextHasChanges) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ savedAt: new Date().toISOString(), edits: cleanEdits, inserts: pendingInserts, deletes: pendingDeletes }));
      } catch { /* noop */ }
      return;
    }
    const { draft: sanitized, converted, removed } = sanitizeDraftPayload({
      edits: cleanEdits,
      inserts: pendingInserts,
      deletes: pendingDeletes,
    });
    if (converted > 0 || removed > 0) {
      setDirty(sanitized.edits ?? {});
      setPendingInserts(sanitized.inserts ?? []);
      setPendingDeletes(sanitized.deletes ?? []);
      if (removed > 0) toast.warning(draftRemovalMessage(removed));
      return;
    }
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          edits: cleanEdits,
          inserts: pendingInserts,
          deletes: pendingDeletes,
        }),
      );
    } catch (e) {
      console.warn("[BPUniverSpike] draft save failed", e);
    }
  }, [dirty, pendingInserts, pendingDeletes, hasChanges, ready, draftKey, categoryLabelLookup, effectiveDirtyForCount]);

  // beforeunload + popstate guards
  useEffect(() => {
    if (!hasChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  // L3 categories dropdown
  const l3Categories = useMemo(() => {
    if (!categories.length) return [] as { id: string; code: string; name: string; label: string }[];
    const byId: Record<string, any> = {};
    categories.forEach((c) => { byId[c.id] = c; });
    const list: { id: string; code: string; name: string; label: string }[] = [];
    for (const c of categories) {
      const p = c.parent_id ? byId[c.parent_id] : null;
      const gp = p?.parent_id ? byId[p.parent_id] : null;
      if (gp && (c.type === "expense" || gp.type === "expense")) {
        list.push({ id: c.id, code: c.code, name: c.name, label: `${c.code} · ${c.name}` });
      }
    }
    list.sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    return list;
  }, [categories]);

  useEffect(() => {
    const l2i = new Map<string, string>();
    const i2l = new Map<string, string>();
    for (const c of categories) {
      if (!c?.id) continue;
      i2l.set(c.id, c?.code && c?.name ? `${c.code} · ${c.name}` : String(c.name ?? c.code ?? c.id));
    }
    for (const c of l3Categories) {
      addLookupAlias(l2i, c.id, c.id);
      addLookupAlias(l2i, c.code, c.id);
      addLookupAlias(l2i, c.label, c.id);
      addLookupAlias(l2i, `${c.code} - ${c.name}`, c.id);
      addLookupAlias(l2i, `${c.code} – ${c.name}`, c.id);
      addLookupAlias(l2i, `${c.code} — ${c.name}`, c.id);
      i2l.set(c.id, c.label);
    }
    categoryLabelToIdRef.current = l2i;
    categoryIdToLabelRef.current = i2l;
  }, [categories, l3Categories]);

  const built = useMemo(() => {
    if (!entries.length || !categories.length) return null;
    const lookup: Record<string, CategoryLookup> = buildCategoryLookup(categories as any);

    type L3Bucket = { code: string; name: string; entries: (Entry & { __insertTempId?: string })[] };
    type L2Bucket = { code: string; name: string; l3s: Map<string, L3Bucket> };
    type L1Bucket = { code: string; name: string; l2s: Map<string, L2Bucket> };
    const tree = new Map<string, L1Bucket>();

    const placeInTree = (item: Entry & { __insertTempId?: string }) => {
      const info = item.category_id ? lookup[item.category_id] : null;
      let l1Code: string, l1Name: string, l2Code: string, l2Name: string, l3Code: string, l3Name: string;
      if (info) {
        l1Code = info.l1Code; l1Name = info.l1Name;
        l2Code = info.l2Code ?? info.l1Code; l2Name = info.l2Name ?? info.l1Name;
        l3Code = info.code; l3Name = info.name;
      } else {
        // "Sem categoria" bucket at the end (código Z para ordenar por último)
        l1Code = "Z"; l1Name = "⚠ Sem categoria — escolher categoria";
        l2Code = "Z.Z"; l2Name = "⚠ Sem categoria";
        l3Code = "Z.Z.Z"; l3Name = "⚠ Sem categoria";
      }
      let l1 = tree.get(l1Code);
      if (!l1) { l1 = { code: l1Code, name: l1Name, l2s: new Map() }; tree.set(l1Code, l1); }
      let l2 = l1.l2s.get(l2Code);
      if (!l2) { l2 = { code: l2Code, name: l2Name, l3s: new Map() }; l1.l2s.set(l2Code, l2); }
      let l3 = l2.l3s.get(l3Code);
      if (!l3) { l3 = { code: l3Code, name: l3Name, entries: [] }; l2.l3s.set(l3Code, l3); }
      l3.entries.push(item);
    };

    for (const e of entries) placeInTree(e);
    // Adicionar inserções pendentes como entries virtuais (com __insertTempId)
    for (const ins of pendingInserts) {
      placeInTree({
        id: `__insert__${ins.tempId}`,
        category_id: ins.category_id,
        description: ins.description,
        specification: ins.specification,
        amount: ins.amount,
        iva_rate: ins.iva_rate,
        formalidade: ins.formalidade,
        status: "draft",
        __insertTempId: ins.tempId,
      });
    }

    const rows: BuiltRow[] = [];
    rows.push({ kind: "header", label: "", indent: 0 });
    const grandRowIdx = rows.length;
    rows.push({ kind: "grand", label: "DESPESAS", indent: 0, childRows: [] });

    const l1Codes = Array.from(tree.keys()).sort(compareHierarchicalCodes);
    for (const l1Code of l1Codes) {
      const l1 = tree.get(l1Code)!;
      const l1Idx = rows.length;
      rows.push({ kind: "l1", label: `${l1.code} · ${l1.name}`, indent: 1, childRows: [] });
      rows[grandRowIdx].childRows!.push(l1Idx);

      const l2Codes = Array.from(l1.l2s.keys()).sort(compareHierarchicalCodes);
      for (const l2Code of l2Codes) {
        const l2 = l1.l2s.get(l2Code)!;
        const l2Idx = rows.length;
        rows.push({ kind: "l2", label: `${l2.code} · ${l2.name}`, indent: 2, childRows: [] });
        rows[l1Idx].childRows!.push(l2Idx);

        const l3Codes = Array.from(l2.l3s.keys()).sort(compareHierarchicalCodes);
        for (const l3Code of l3Codes) {
          const l3 = l2.l3s.get(l3Code)!;
          const l3Idx = rows.length;
          rows.push({ kind: "l3", label: `${l3.code} · ${l3.name}`, indent: 3, childRows: [] });
          rows[l2Idx].childRows!.push(l3Idx);

          l3.entries.sort((a, b) => {
            // inserções vão para o fim do grupo
            const aIns = !!a.__insertTempId;
            const bIns = !!b.__insertTempId;
            if (aIns !== bIns) return aIns ? 1 : -1;
            return (a.description ?? "").localeCompare(b.description ?? "");
          });
          for (const e of l3.entries) {
            const eIdx = rows.length;
            rows.push({ kind: "entry", label: "", indent: 4, entry: e });
            rows[l3Idx].childRows!.push(eIdx);
          }
        }
      }
    }
    return rows;
  }, [entries, categories, pendingInserts]);

  const workbookData = useMemo(() => {
    if (!built) return null;
    const lookup: Record<string, CategoryLookup> = buildCategoryLookup(categories as any);
    const header = ["Rubrica", "Categoria", "Especificação", "Valor s/IVA", "IVA %", "Total c/IVA", "Formalidade"];
    const cellData: Record<number, Record<number, any>> = {};
    const rowData: Record<number, any> = {};
    const protectedCells = new Set<string>();
    const protectedRows: number[] = [];
    const protectedFormulaRows: number[] = [];
    const originalFormulas = new Map<string, string>();
    const entryRows: number[] = [];
    const rowToEntryId = new Map<number, string>();
    const entryIdToRow = new Map<string, number>();
    const insertRowToTempId = new Map<number, string>();
    const insertedCategoryCells = new Set<string>();

    const markProtected = (r: number, c: number) => protectedCells.add(`${r},${c}`);

    cellData[0] = {};
    header.forEach((h, c) => {
      cellData[0][c] = { v: h, s: "sHeader" };
      markProtected(0, c);
    });
    protectedRows.push(0);
    rowData[0] = { h: 28 };

    built.forEach((row, r) => {
      if (r === 0) return;
      cellData[r] = {};
      const styleByKind: Record<RowKind, string> = {
        header: "sHeader", grand: "sGrand", l1: "sL1", l2: "sL2", l3: "sL3", entry: "sEntry",
      };
      const styleRubric: Record<RowKind, string> = {
        header: "sHeader", grand: "sGrandLabel", l1: "sL1Label", l2: "sL2Label", l3: "sL3Label", entry: "sEntryLabel",
      };
      const st = styleByKind[row.kind];
      const stLabel = styleRubric[row.kind];

      if (row.kind === "entry") {
        const e = row.entry!;
        const info = e.category_id ? lookup[e.category_id] : null;
        const catLabel = info ? `${info.code} · ${info.name}` : "";
        const isInsert = !!e.__insertTempId;
        // Linhas inseridas partilham EXATAMENTE os mesmos estilos das entries
        // (indentação, formato numérico, IVA) — apenas trocamos o preset por
        // uma variante com fundo verde. Isto garante que o rebuild trata a
        // nova linha como um lançamento normal.
        const rubricStyle = isInsert ? "sInsertedLabel" : stLabel;
        const catStyle = isInsert ? "sInsertedCategoryLocked" : st;
        const specStyle = isInsert ? "sInsertedRow" : st;
        const amountStyle = isInsert ? "sInsertedMoney" : "sMoney";
        const ivaStyle = isInsert ? "sInsertedIva" : "sIva";
        const totalStyle = isInsert ? "sInsertedMoneyCalc" : "sMoneyCalc";
        const formalidadeStyle = isInsert ? "sInsertedRow" : st;
        cellData[r][COL.RUBRIC] = { v: e.description ?? "", s: rubricStyle };
        cellData[r][COL.CATEGORY] = { v: catLabel, s: catStyle };
        cellData[r][COL.SPEC] = { v: e.specification ?? "", s: specStyle };
        cellData[r][COL.AMOUNT] = { v: e.amount, s: amountStyle };
        cellData[r][COL.IVA] = { v: e.iva_rate, s: ivaStyle };
        const totalFormula = `=${L_AMOUNT}${r + 1}*(1+${L_IVA}${r + 1}/100)`;
        const totalValue = (e.amount ?? 0) * (1 + (e.iva_rate ?? 0) / 100);
        cellData[r][COL.TOTAL] = { v: totalValue, f: totalFormula, s: totalStyle };
        cellData[r][COL.FORMALIDADE] = { v: enumToLabel(e.formalidade), s: formalidadeStyle };
        markProtected(r, COL.TOTAL);
        protectedFormulaRows.push(r);
        originalFormulas.set(`${r},${COL.TOTAL}`, totalFormula);
        entryRows.push(r);
        if (isInsert) {
          insertRowToTempId.set(r, e.__insertTempId!);
          // Categoria herdada da posição no grupo — read-only
          markProtected(r, COL.CATEGORY);
          insertedCategoryCells.add(`${r},${COL.CATEGORY}`);
        } else {
          rowToEntryId.set(r, e.id);
          entryIdToRow.set(e.id, r);
        }
      } else {
        cellData[r][COL.RUBRIC] = { v: row.label, s: stLabel };
        cellData[r][COL.CATEGORY] = { v: "", s: st };
        cellData[r][COL.SPEC] = { v: "", s: st };
        const childRows = row.childRows ?? [];
        const childRefs = childRows.map((cr) => cr + 1);
        const sumAmount = childRefs.length ? `=` + childRefs.map((rr) => `${L_AMOUNT}${rr}`).join("+") : `=0`;
        const sumTotal = childRefs.length ? `=` + childRefs.map((rr) => `${L_TOTAL}${rr}`).join("+") : `=0`;
        const sumAmountValue = childRows.reduce((sum, cr) => sum + (Number(cellData[cr]?.[COL.AMOUNT]?.v) || 0), 0);
        const sumTotalValue = childRows.reduce((sum, cr) => sum + (Number(cellData[cr]?.[COL.TOTAL]?.v) || 0), 0);
        const moneyStyle = row.kind === "grand" ? "sMoneyGrand" : row.kind === "l1" ? "sMoneyL1" : row.kind === "l2" ? "sMoneyL2" : "sMoneyL3";
        cellData[r][COL.AMOUNT] = { v: sumAmountValue, f: sumAmount, s: moneyStyle };
        cellData[r][COL.IVA] = { v: "", s: st };
        cellData[r][COL.TOTAL] = { v: sumTotalValue, f: sumTotal, s: moneyStyle };
        cellData[r][COL.FORMALIDADE] = { v: "", s: st };
        for (let c = 0; c < N_COLS; c++) markProtected(r, c);
        protectedRows.push(r);
        originalFormulas.set(`${r},${COL.AMOUNT}`, sumAmount);
        originalFormulas.set(`${r},${COL.TOTAL}`, sumTotal);
      }
    });

    protectedCellsRef.current = protectedCells;
    protectedRowsRef.current = protectedRows;
    protectedFormulaRowsRef.current = protectedFormulaRows;
    originalFormulasRef.current = originalFormulas;
    entryRowsRef.current = entryRows;
    rowToEntryIdRef.current = rowToEntryId;
    entryIdToRowRef.current = entryIdToRow;
    categoryDropdownRef.current = l3Categories.map((c) => c.label);
    nextInsertRowRef.current = built.length; // legacy — no longer used
    insertRowToTempIdRef.current = insertRowToTempId;
    insertedCategoryCellsRef.current = insertedCategoryCells;

    const totalRows = built.length + 50; // headroom for inserts
    const sheetRowCount = Math.max(totalRows, 200);
    sheetRowCountRef.current = sheetRowCount;
    for (let r = 0; r < sheetRowCount; r++) markProtected(r, COL.TOTAL);

    return {
      id: "bp-univer-spike",
      name: "BP Anitta EDA 2026",
      appVersion: "0.25.1",
      locale: LocaleType.PT_BR,
      styles: {
        sHeader: {
          bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" },
          ht: 2, vt: 2,
          bd: { t: { s: 1, cl: { rgb: "#334155" } }, b: { s: 1, cl: { rgb: "#334155" } } },
        },
        sGrand: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" } },
        sGrandLabel: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" }, pd: { l: 4 } },
        sMoneyGrand: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" }, n: { pattern: "#,##0.00 [$€-816]" } },
        sL1: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" } },
        sL1Label: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" }, pd: { l: 12 } },
        sMoneyL1: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        sL2: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" } },
        sL2Label: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" }, pd: { l: 24 } },
        sMoneyL2: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        sL3: { bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" } },
        sL3Label: { bl: 1, bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" }, pd: { l: 36 } },
        sMoneyL3: { bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        sEntry: {},
        sEntryLabel: { pd: { l: 48 } },
        sMoney: { n: { pattern: "#,##0.00 [$€-816]" } },
        sMoneyCalc: { n: { pattern: "#,##0.00 [$€-816]" }, cl: { rgb: "#475569" } },
        sIva: { n: { pattern: "0.0" }, ht: 3 },
        sErrorRow: { bg: { rgb: "#fee2e2" } },
        sDeletedRow: { bg: { rgb: "#fecaca" }, cl: { rgb: "#991b1b" }, st: { s: 1 } },
        sInsertedRow: { bg: { rgb: "#dcfce7" } },
        // Variantes "inserted" que preservam indentação/formato numérico das
        // linhas de lançamento normais (mesmo pd/n/ht) e apenas somam o fundo
        // verde. Fix: garante que colar/pintar linha nova mostra indent na
        // coluna A e formata D/E/F como as restantes.
        sInsertedLabel: { bg: { rgb: "#dcfce7" }, pd: { l: 48 } },
        sInsertedMoney: { bg: { rgb: "#dcfce7" }, n: { pattern: "#,##0.00 [$€-816]" } },
        sInsertedMoneyCalc: { bg: { rgb: "#dcfce7" }, n: { pattern: "#,##0.00 [$€-816]" }, cl: { rgb: "#475569" } },
        sInsertedIva: { bg: { rgb: "#dcfce7" }, n: { pattern: "0.0" }, ht: 3 },
        // Categoria herdada — read-only, texto esbatido
        sInsertedCategoryLocked: { bg: { rgb: "#dcfce7" }, cl: { rgb: "#94a3b8" }, it: 1 },
      },
      sheetOrder: ["sheet1"],
      sheets: {
        sheet1: {
          id: "sheet1",
          name: "BP",
          rowCount: sheetRowCount,
          columnCount: N_COLS,
          freeze: { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 },
          columnData: {
            [COL.RUBRIC]: { w: 320 },
            [COL.CATEGORY]: { w: 220 },
            [COL.SPEC]: { w: 220 },
            [COL.AMOUNT]: { w: 130 },
            [COL.IVA]: { w: 70 },
            [COL.TOTAL]: { w: 140 },
            [COL.FORMALIDADE]: { w: 150 },
          },
          rowData,
          cellData,
        },
      },
    };
  }, [built, categories, l3Categories]);

  // Reset dirty/pending state when data reloads (fresh save/reset)
  useEffect(() => {
    // Only reset if the underlying entries reference changed AND we are ready
    // (not during initial mount before Univer built)
    if (!ready) return;
    setDirty({});
    setPendingInserts([]);
    setPendingDeletes([]);
    setValidationErrors([]);
    setActionLog([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Reescreve a fórmula de F para uma linha — força o motor a recalcular F e
  // os subtotais SUM acima. Substitui chamadas frágeis a getFormula().executeCalculation
  // (API não garantida em @univerjs/presets 0.25). DETERMINÍSTICO.
  const forceRecalcFormula = useCallback((sheet: any, row: number) => {
    try {
      const formula = `=${L_AMOUNT}${row + 1}*(1+${L_IVA}${row + 1}/100)`;
      const aRaw = sheet.getRange(row, COL.AMOUNT, 1, 1)?.getValue?.();
      const iRaw = sheet.getRange(row, COL.IVA, 1, 1)?.getValue?.();
      const a = aRaw && typeof aRaw === "object" && "v" in aRaw ? (aRaw as any).v : aRaw;
      const i = iRaw && typeof iRaw === "object" && "v" in iRaw ? (iRaw as any).v : iRaw;
      const numAmount = Number(a) || 0;
      const numIva = Number(i) || 0;
      const v = numAmount * (1 + numIva / 100);
      const range = sheet.getRange(row, COL.TOTAL, 1, 1);
      // Escrever { f, v } reforça a fórmula E dá um valor imediato caso o motor demore.
      range?.setValue?.({ f: formula, v });
    } catch (e) {
      console.warn("[BPUniverSpike] força recálculo F falhou linha", row, e);
    }
  }, []);

  // Command listener: track edits to entry rows / insert rows
  const collectSheetDirtyEdits = useCallback((rowsFilter?: Set<number>): Record<string, Partial<Entry>> => {
    const api = apiRef.current;
    const sheet = api?.getActiveWorkbook?.()?.getActiveSheet?.();
    if (!sheet) return dirtyRef.current;

    const readCellValue = (row: number, col: number) => {
      const raw = sheet.getRange(row, col, 1, 1)?.getValue?.();
      return raw && typeof raw === "object" && "v" in raw ? (raw as any).v : raw;
    };

    const next: Record<string, Partial<Entry>> = {};
    const originals = originalEntriesRef.current;
    const catLabelToId = categoryLabelToIdRef.current;

    for (const [row, id] of rowToEntryIdRef.current) {
      if (rowsFilter && !rowsFilter.has(row)) continue;
      const original = originals.get(id);
      if (!original) continue;

      const rawDescription = readCellValue(row, COL.RUBRIC);
      const rawCategory = readCellValue(row, COL.CATEGORY);
      const rawSpecification = readCellValue(row, COL.SPEC);
      const rawAmount = readCellValue(row, COL.AMOUNT);
      const rawIva = readCellValue(row, COL.IVA);
      const rawFormalidade = readCellValue(row, COL.FORMALIDADE);
      const amount = parseAmount(rawAmount);
      const ivaRate = parseIntSafe(rawIva);
      const originalCategoryHasLabel = !!(original.category_id && categoryIdToLabelRef.current.has(original.category_id));
      const categoryValue =
        (rawCategory == null || rawCategory === "") && original.category_id && !originalCategoryHasLabel
          ? original.category_id
          : resolveCategoryEditValue(
            rawCategory,
            original.category_id,
            categoryIdToLabelRef.current,
            catLabelToId,
          );
      const values: Partial<Entry> = {
        description: rawDescription == null ? "" : String(rawDescription),
        category_id: categoryValue,
        specification: rawSpecification == null || rawSpecification === "" ? null : String(rawSpecification),
        amount: amount === null || !isFinite(amount) ? original.amount : amount,
        iva_rate: ivaRate === null || !isFinite(ivaRate) || ivaRate < 0 ? original.iva_rate : ivaRate,
        formalidade: normalizeFormalidadeEditValue(rawFormalidade),
      };

      const delta: Partial<Entry> = {};
      for (const field of ["description", "category_id", "specification", "amount", "iva_rate", "formalidade"] as (keyof Entry)[]) {
        if (!entryFieldEquals((original as any)[field], (values as any)[field])) {
          (delta as any)[field] = (values as any)[field];
        }
      }
      if (Object.keys(delta).length) next[id] = delta;
    }

    const { edits: normalized } = normalizeRecoveredEditValues(next, categoryLabelToIdRef.current);
    return pruneNoOpEdits(normalized, originals).edits;
  }, []);

  const sweepNumericColumnsFromSheet = useCallback(() => {
    const api = apiRef.current;
    const sheet = api?.getActiveWorkbook?.()?.getActiveSheet?.();
    if (!sheet) return;

    const insertsDelta: Record<string, Partial<InsertRow>> = {};
    const editsDelta: Record<string, Partial<Entry>> = {};
    const originals = originalEntriesRef.current;
    const rowsTouched = new Set<number>();

    const readCellValue = (row: number, col: number) => {
      const raw = sheet.getRange(row, col, 1, 1)?.getValue?.();
      return raw && typeof raw === "object" && "v" in raw ? (raw as any).v : raw;
    };

    const writeNumber = (row: number, col: number, value: number) => {
      sheet.getRange(row, col, 1, 1)?.setValue?.(value);
    };

    const fallbackForEntry = (id: string, field: "amount" | "iva_rate") => {
      const current = dirtyRef.current[id]?.[field];
      if (typeof current === "number" && isFinite(current)) return current;
      const original = originals.get(id)?.[field];
      return typeof original === "number" && isFinite(original) ? original : 0;
    };

    const fallbackForInsert = (tempId: string, field: "amount" | "iva_rate") => {
      const row = pendingInserts.find((p) => p.tempId === tempId);
      const value = row?.[field];
      return typeof value === "number" && isFinite(value) ? value : 0;
    };

    const normalizeCell = (row: number, col: number, ownerId: string, ownerType: "entry" | "insert") => {
      const raw = readCellValue(row, col);
      if (raw === null || raw === undefined || raw === "") return;
      const field = col === COL.AMOUNT ? "amount" : "iva_rate";
      let parsed: number | null;
      if (typeof raw === "number") {
        parsed = isFinite(raw) ? raw : null;
      } else {
        parsed = col === COL.AMOUNT ? parseAmount(raw) : parseIntSafe(raw);
      }
      if (parsed === null || !isFinite(parsed) || (field === "iva_rate" && parsed < 0)) {
        const fallback = ownerType === "entry" ? fallbackForEntry(ownerId, field) : fallbackForInsert(ownerId, field);
        writeNumber(row, col, fallback);
        rowsTouched.add(row);
        if (ownerType === "entry") editsDelta[ownerId] = { ...(editsDelta[ownerId] ?? {}), [field]: fallback };
        toast.error(field === "amount" ? "Valor numérico inválido — usa vírgula ou ponto decimal." : "IVA inválido — usa uma percentagem numérica.");
        return;
      }
      // Only re-write if the cell wasn't already numeric (avoid unnecessary command loop).
      if (typeof raw !== "number") {
        writeNumber(row, col, parsed);
        rowsTouched.add(row);
        if (ownerType === "entry") editsDelta[ownerId] = { ...(editsDelta[ownerId] ?? {}), [field]: parsed };
      }
      if (ownerType === "insert") {
        insertsDelta[ownerId] = { ...(insertsDelta[ownerId] ?? {}), [field]: parsed };
      }
    };

    // Todas as escritas abaixo são programáticas — não devem alimentar dirty via listener.
    isProgrammaticWriteRef.current = true;
    try {
      for (const [row, id] of rowToEntryIdRef.current) {
        normalizeCell(row, COL.AMOUNT, id, "entry");
        normalizeCell(row, COL.IVA, id, "entry");
      }
      for (const [row, tempId] of insertRowToTempIdRef.current) {
        normalizeCell(row, COL.AMOUNT, tempId, "insert");
        normalizeCell(row, COL.IVA, tempId, "insert");
      }
      // Reescreve a fórmula de F para cada linha que teve D/E tocado — força recálculo.
      for (const row of rowsTouched) forceRecalcFormula(sheet, row);
    } finally {
      // Liberta o flag após o próximo frame para apanhar comandos que o Univer despacha async.
      requestAnimationFrame(() => { isProgrammaticWriteRef.current = false; });
    }

    if (Object.keys(editsDelta).length) {
      const nextDirty = mergeDirtyEdits(
        dirtyRef.current,
        editsDelta,
        originals,
        categoryLabelToIdRef.current,
      );
      dirtyRef.current = nextDirty;
      setDirty(nextDirty);
    }
    if (Object.keys(insertsDelta).length) {
      setPendingInserts((prev) => prev.map((row) => ({ ...row, ...(insertsDelta[row.tempId] ?? {}) })));
    }
  }, [pendingInserts, forceRecalcFormula, collectSheetDirtyEdits]);

  const scheduleNumericSweep = useCallback(() => {
    if (numericSweepRafRef.current != null) cancelAnimationFrame(numericSweepRafRef.current);
    numericSweepRafRef.current = requestAnimationFrame(() => {
      numericSweepRafRef.current = null;
      sweepNumericColumnsFromSheet();
    });
  }, [sweepNumericColumnsFromSheet]);

  const handleCommandExecuted = useCallback((id: string, params: any) => {
    if (id !== "sheet.command.set-range-values" && !RANGE_WRITE_COMMANDS.has(id)) return;
    // Ignora escritas programáticas (sweep, replay de rascunho, recálculo de F).
    // Estas alteram células mas NÃO são edições do utilizador → não podem entrar no dirty.
    if (isProgrammaticWriteRef.current) return;
    const cellValue = getCommandCellValueMatrix(params);
    if (!cellValue) {
      // Sem matriz explícita não fazemos scan global: isso acordava divergências
      // antigas e inflava o contador. O sweep abaixo só normaliza D/E tocadas.
      scheduleNumericSweep();
      return;
    }
    const rowToEntry = rowToEntryIdRef.current;
    const rowToTemp = insertRowToTempIdRef.current;
    const originals = originalEntriesRef.current;
    const catLabelToId = categoryLabelToIdRef.current;

    const editsDelta: Record<string, Partial<Entry>> = {};
    const insertsDelta: Record<string, Partial<InsertRow>> = {};

    for (const [rowKey, rowMap] of Object.entries(cellValue)) {
      const r = Number(rowKey);
      if (!rowMap || typeof rowMap !== "object") continue;
      const entryId = rowToEntry.get(r);
      const tempId = rowToTemp.get(r);
      if (!entryId && !tempId) continue;
      for (const [colKey, cellRaw] of Object.entries(rowMap as Record<string, any>)) {
        if (cellRaw && typeof cellRaw === "object" && !Object.prototype.hasOwnProperty.call(cellRaw, "v")) continue;
        const c = Number(colKey);
        const v = getCellValuePayload(cellRaw);
        let field: keyof Entry | null = null;
        let value: any = v;
        switch (c) {
          case COL.RUBRIC:
            field = "description";
            value = v == null ? "" : String(v);
            break;
          case COL.CATEGORY: {
            field = "category_id";
            const original = entryId ? originals.get(entryId) : null;
            value = resolveCategoryEditValue(
              v,
              original?.category_id,
              categoryIdToLabelRef.current,
              catLabelToId,
            );
            break;
          }
          case COL.SPEC:
            field = "specification";
            value = v == null || v === "" ? null : String(v);
            break;
          case COL.AMOUNT:
            field = "amount";
            value = parseAmount(v);
            if (value === null || !isFinite(value)) {
              toast.error("Valor numérico inválido — usa números (ex.: 1064,42 ou 1064.42).");
              continue;
            }
            break;
          case COL.IVA:
            field = "iva_rate";
            value = parseIntSafe(v);
            if (value === null || !isFinite(value) || value < 0) {
              toast.error("IVA inválido — usa uma percentagem numérica.");
              continue;
            }
            break;
          case COL.FORMALIDADE: {
            field = "formalidade";
            value = labelToEnum(v == null ? "" : String(v));
            break;
          }
          default:
            break;
        }
        if (!field) continue;
        if (entryId) {
          editsDelta[entryId] = { ...(editsDelta[entryId] ?? {}), [field]: value };
        } else if (tempId) {
          insertsDelta[tempId] = { ...(insertsDelta[tempId] ?? {}), [field]: value };
        }
      }
    }

    if (!Object.keys(editsDelta).length && !Object.keys(insertsDelta).length) return;

    const nextDirtyFromDelta = mergeDirtyEdits(
      dirtyRef.current,
      editsDelta,
      originals,
      categoryLabelToIdRef.current,
    );

    for (const [entryId, delta] of Object.entries(editsDelta)) {
      const effectiveDelta = nextDirtyFromDelta[entryId];
      for (const field of Object.keys(delta) as (keyof Entry)[]) {
        if (!effectiveDelta || !Object.prototype.hasOwnProperty.call(effectiveDelta, field)) {
          delete (delta as any)[field];
        }
      }
      if (Object.keys(delta).length === 0) delete editsDelta[entryId];
    }

    for (const [tempId, delta] of Object.entries(insertsDelta)) {
      const current = pendingInserts.find((p) => p.tempId === tempId);
      if (!current) {
        delete insertsDelta[tempId];
        continue;
      }
      for (const field of Object.keys(delta) as (keyof InsertRow)[]) {
        if (entryFieldEquals((current as any)[field], (delta as any)[field])) delete (delta as any)[field];
      }
      if (Object.keys(delta).length === 0) delete insertsDelta[tempId];
    }

    // Capture previous values (from dirty or originals) BEFORE mutating state, so
    // that Desfazer pode reverter célula-a-célula.
    const prevEntry: Record<string, Partial<Entry>> = {};
    const prevInsert: Record<string, Partial<InsertRow>> = {};
    const rowsAffected = new Set<number>();
    for (const [id, delta] of Object.entries(editsDelta)) {
      const cur = dirtyRef.current[id] ?? {};
      const orig = originals.get(id);
      const snap: Partial<Entry> = {};
      for (const k of Object.keys(delta) as (keyof Entry)[]) {
        const prevVal = k in cur ? (cur as any)[k] : (orig ? (orig as any)[k] : undefined);
        (snap as any)[k] = prevVal;
      }
      prevEntry[id] = snap;
      const r = entryIdToRowRef.current.get(id);
      if (r != null) rowsAffected.add(r);
    }
    for (const [tempId, delta] of Object.entries(insertsDelta)) {
      const cur = pendingInserts.find((p) => p.tempId === tempId);
      const snap: Partial<InsertRow> = {};
      for (const k of Object.keys(delta) as (keyof InsertRow)[]) {
        (snap as any)[k] = cur ? (cur as any)[k] : undefined;
      }
      prevInsert[tempId] = snap;
    }
    const hasEdits = Object.keys(editsDelta).length > 0;
    const hasInserts = Object.keys(insertsDelta).length > 0;
    if (hasEdits || hasInserts) {
      setActionLog((log) => [
        ...log,
        { kind: "edit", data: { prevEntry, prevInsert, rowsAffected: Array.from(rowsAffected) } },
      ]);
    }

    dirtyRef.current = nextDirtyFromDelta;
    setDirty(nextDirtyFromDelta);
    if (hasInserts) {
      setPendingInserts((prev) =>
        prev.map((row) => {
          const delta = insertsDelta[row.tempId];
          if (!delta) return row;
          return { ...row, ...delta } as InsertRow;
        }),
      );
    }
    scheduleNumericSweep();
  }, [scheduleNumericSweep, pendingInserts, collectSheetDirtyEdits]);

  // Ref indireto para o handler — evita que o useEffect que instancia o Univer
  // (deps: [workbookData, handleCommandExecuted]) re-monte a cada mudança em
  // pendingInserts (que altera sweepNumericColumnsFromSheet → scheduleNumericSweep
  // → handleCommandExecuted). O re-mount destruía o stack de Undo nativo e fazia
  // o Univer recarregar workbookData com valores pré-computados obsoletos (F
  // ficava estática em vez de recalcular).
  const handleCommandExecutedRef = useRef(handleCommandExecuted);
  useEffect(() => { handleCommandExecutedRef.current = handleCommandExecuted; }, [handleCommandExecuted]);

  // Instantiate Univer
  useEffect(() => {
    if (!containerRef.current || !workbookData || univerRef.current) return;
    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.PT_BR,
        locales: { [LocaleType.EN_US]: merge({}, sheetsCoreEnUS), [LocaleType.PT_BR]: merge({}, sheetsCorePtBR) },
        presets: [
          UniverSheetsCorePreset({ container: containerRef.current, header: false, toolbar: false } as any),
          UniverSheetsDataValidationPreset(),
        ],
      });
      univerRef.current = univer;
      apiRef.current = univerAPI;
      univerAPI.createWorkbook(workbookData);

      const rangeHitsInsertedCategory = (): boolean => {
        const cells = insertedCategoryCellsRef.current;
        if (!cells.size) return false;
        const ranges = getActiveRangesForToast();
        return ranges.some((range) => {
          for (let r = range.startRow; r <= range.endRow; r++) {
            for (let c = range.startColumn; c <= range.endColumn; c++) {
              if (cells.has(`${r},${c}`)) return true;
            }
          }
          return false;
        });
      };
      const getActiveRangesForToast = (): UniverRange[] => {
        const wb = univerAPI.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        const selectionRanges = selectionRangesRef.current;
        if (selectionRanges.length) return selectionRanges;
        const activeRange = wb?.getActiveRange?.() ?? sheet?.getActiveRange?.();
        const normalized = normalizeRange(activeRange);
        return normalized ? [normalized] : [];
      };
      const showProtectedToast = () => {
        const now = Date.now();
        if (now - toastThrottleRef.current < 1200) return;
        toastThrottleRef.current = now;
        if (rangeHitsInsertedCategory()) {
          toast.info(INSERTED_CATEGORY_TOAST);
        } else {
          toast.warning(PROTECTED_CELL_TOAST);
        }
      };

      const getActiveRanges = (): UniverRange[] => {
        const wb = univerAPI.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        const selectionRanges = selectionRangesRef.current;
        if (selectionRanges.length) return selectionRanges;
        const activeRange = wb?.getActiveRange?.() ?? sheet?.getActiveRange?.();
        const normalized = normalizeRange(activeRange);
        return normalized ? [normalized] : [];
      };

      const getCommandRanges = (params: any): UniverRange[] => {
        const ranges: UniverRange[] = [];
        const push = (value: any) => {
          const normalized = normalizeRange(value);
          if (normalized) ranges.push(normalized);
        };
        push(params?.range);
        push(params?.targetRange);
        push(params?.sourceRange);
        push(params?.clearRange);
        push(params?.selectionRange);
        if (Array.isArray(params?.ranges)) params.ranges.forEach(push);
        if (Array.isArray(params?.selections)) params.selections.forEach(push);
        if (typeof params?.row === "number" && typeof params?.column === "number") {
          push({ startRow: params.row, endRow: params.row, startColumn: params.column, endColumn: params.column });
        }
        return ranges;
      };

      const commandTouchesProtectedCell = (id: string, params: any) => {
        if (!USER_ACTION_COMMANDS.has(id)) return false;
        const protectedCells = protectedCellsRef.current;
        if (matrixHitsProtectedCell(params?.cellValue, protectedCells)) return true;
        const ranges = getCommandRanges(params);
        if (EDIT_BLOCK_COMMANDS.has(id)) {
          if (params && params.visible === false) return false;
          return ranges.some((range) => rangeHitsProtectedCell(range, protectedCells));
        }
        if (RANGE_WRITE_COMMANDS.has(id)) {
          const candidateRanges = ranges.length ? ranges : getActiveRanges();
          return candidateRanges.some((range) => rangeHitsProtectedCell(range, protectedCells));
        }
        return false;
      };

      const isProtectedActive = () => {
        const protectedCells = protectedCellsRef.current;
        const ranges = getActiveRanges();
        return ranges.some((range) => rangeHitsProtectedCell(range, protectedCells));
      };
      const isEditingActive = () => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return true;
        return false;
      };
      const EDIT_KEYS = new Set(["Enter", "F2", "Delete", "Backspace"]);
      const onDomKey = (e: KeyboardEvent) => {
        const container = containerRef.current;
        if (!container) return;
        if (!container.contains(e.target as Node) && !container.contains(document.activeElement)) return;
        if (isEditingActive()) return;
        const key = e.key;
        const isEditKey = EDIT_KEYS.has(key);
        const isPrintable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        const isPasteCut = (e.ctrlKey || e.metaKey) && (key === "v" || key === "V" || key === "x" || key === "X");
        if (!isEditKey && !isPrintable && !isPasteCut) return;
        if (!isProtectedActive()) return;
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        showProtectedToast();
      };
      const onDomPaste = (e: ClipboardEvent) => {
        const container = containerRef.current;
        if (!container) return;
        if (!container.contains(e.target as Node) && !container.contains(document.activeElement)) return;
        if (isEditingActive()) return;
        if (!isProtectedActive()) return;
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        showProtectedToast();
      };
      document.addEventListener("keydown", onDomKey, true);
      document.addEventListener("paste", onDomPaste, true);
      document.addEventListener("cut", onDomPaste, true);
      domProtectionCleanupRef.current = () => {
        document.removeEventListener("keydown", onDomKey, true);
        document.removeEventListener("paste", onDomPaste, true);
        document.removeEventListener("cut", onDomPaste, true);
      };

      // Data validation on entry rows.
      // Corre em cada rebuild (o effect tem workbookData na dep list) e é
      // adiada em duplo rAF para garantir que a sheet acabou de inicializar
      // as linhas recém-inseridas antes de lhes aplicar regras — sem esta
      // deferração, setDataValidation em linhas novas era silenciosamente
      // ignorada. Lê SEMPRE entryRowsRef.current no momento da aplicação,
      // já remapeado pelo useMemo do workbookData.
      const applyDataValidations = () => {
        const wb = univerAPI.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        if (!sheet || !(univerAPI as any).newDataValidation) return;
        for (const r of entryRowsRef.current) {
          // Formalidade — bloqueante (rejeita texto fora da lista, inclui paste)
          try {
            const formRange = sheet.getRange(r, COL.FORMALIDADE, 1, 1);
            // Idempotência: limpa regra existente antes de reaplicar. Sem isto,
            // reaplicar a mesma regra pode disparar exceção e abortar o loop.
            try { formRange.setDataValidation(null as any); } catch {}
            const formRule = (univerAPI as any).newDataValidation()
              .requireValueInList(FORMALIDADE_LABELS)
              .setOptions({ allowInvalid: false, showDropdown: true, error: "Escolhe um estado da lista." })
              .build();
            formRange.setDataValidation(formRule);
          } catch (dvErr) {
            console.warn(`[BPUniverSpike] DV Formalidade falhou r=${r}:`, dvErr);
          }

          if (categoryDropdownRef.current.length) {
            try {
              const catRange = sheet.getRange(r, COL.CATEGORY, 1, 1);
              try { catRange.setDataValidation(null as any); } catch {}
              // Linhas inseridas: categoria herdada da posição, read-only — sem dropdown.
              if (insertedCategoryCellsRef.current.has(`${r},${COL.CATEGORY}`)) {
                continue;
              }
              const catRule = (univerAPI as any).newDataValidation()
                .requireValueInList(categoryDropdownRef.current)
                .setOptions({ allowInvalid: false, showDropdown: true, error: "Escolhe uma categoria L3 da lista." })
                .build();
              catRange.setDataValidation(catRule);
            } catch (dvErr) {
              console.warn(`[BPUniverSpike] DV Categoria falhou r=${r}:`, dvErr);
            }
          }
        }
      };

      applyDataValidations();
      // Reaplicar após o browser paintar — cobre o caso de rebuild em que a
      // sheet ainda estava a materializar as linhas novas na 1ª chamada.
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(applyDataValidations);
        (dvRafRef as any).current = raf2;
      });
      (dvRafRef as any).current = raf1;


      try {
        const wb = univerAPI.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        const permission = sheet?.getWorksheetPermission?.();
        if (sheet && permission?.protectRanges) {
          const rowRanges = compactRowsToRanges(protectedRowsRef.current, 0, N_COLS);
          const formulaRanges = compactRowsToRanges(protectedFormulaRowsRef.current, COL.TOTAL, 1);
          const configs = [...rowRanges, ...formulaRanges].map((range, idx) => ({
            ranges: [sheet.getRange(range.startRow, range.startColumn, range.endRow - range.startRow + 1, range.endColumn - range.startColumn + 1)],
            options: { name: `BP protegido ${idx + 1}`, allowViewByOthers: true },
          }));
          permission.protectRanges(configs).catch((protectionErr: any) => {
            console.warn("[BPUniverSpike] proteção nativa Univer não aplicada:", protectionErr);
          });
        }

        const Event = (univerAPI as any).Event;
        if (Event && (univerAPI as any).addEvent) {
          wb?.onSelectionChange?.((ranges: any[]) => {
            selectionRangesRef.current = (ranges ?? []).map(normalizeRange).filter(Boolean) as UniverRange[];
          });

          (univerAPI as any).addEvent(Event.BeforeCommandExecute, (event: any) => {
            const id = event?.id;
            if (!id) return;
            if (commandTouchesProtectedCell(id, event?.params)) {
              event.cancel = true;
              showProtectedToast();
              return;
            }
            // Normalização de input numérico PT nas colunas AMOUNT e IVA.
            // Se o utilizador escrever "1064,42" / "1.064,42" / "1 064,42" / "1.064,42 €"
            // convertemos para número antes do commit. Se for texto não numérico → rejeita.
            if (id === "sheet.command.set-range-values" || RANGE_WRITE_COMMANDS.has(id)) {
              const cellValue = event?.params?.cellValue;
              if (cellValue && typeof cellValue === "object") {
                let invalid = false;
                for (const rowKey of Object.keys(cellValue)) {
                  const rowMap = cellValue[rowKey];
                  if (!rowMap || typeof rowMap !== "object") continue;
                  for (const colKey of Object.keys(rowMap)) {
                    const c = Number(colKey);
                    if (c !== COL.AMOUNT && c !== COL.IVA) continue;
                    const cell = rowMap[colKey];
                    if (!cell) continue;
                    const raw = cell.v;
                    if (raw === null || raw === undefined || raw === "") continue;
                    if (typeof raw === "number") continue;
                    const parsed = c === COL.AMOUNT ? parseAmount(raw) : parseIntSafe(raw);
                    if (parsed === null || !isFinite(parsed) || (c === COL.IVA && parsed < 0)) {
                      invalid = true;
                      break;
                    }
                    cell.v = parsed;
                    // Limpa formatos herdados de string (ex.: paste com "€").
                    if (cell.t !== undefined) cell.t = 2; // CellValueType.NUMBER
                  }
                  if (invalid) break;
                }
                if (invalid) {
                  event.cancel = true;
                  const now = Date.now();
                  if (now - toastThrottleRef.current >= 1200) {
                    toastThrottleRef.current = now;
                    toast.error("Valor numérico inválido — usa números (ex.: 1064,42 ou 1064.42).");
                  }
                  return;
                }
              }
            }
          });

          // Track edits AFTER command executes
          if (Event.CommandExecuted) {
            (univerAPI as any).addEvent(Event.CommandExecuted, (event: any) => {
              handleCommandExecutedRef.current?.(event?.id, event?.params);
            });
          }
        }
      } catch (evtErr) {
        console.warn("[BPUniverSpike] não foi possível instalar listener de proteção:", evtErr);
      }

      setReady(true);
    } catch (e: any) {
      setErr("Falha a inicializar Univer: " + (e?.message ?? String(e)));
    }
    return () => {
      if (dvRafRef.current != null) { cancelAnimationFrame(dvRafRef.current); dvRafRef.current = null; }
      if (numericSweepRafRef.current != null) { cancelAnimationFrame(numericSweepRafRef.current); numericSweepRafRef.current = null; }
      try { domProtectionCleanupRef.current?.(); } catch { /* noop */ }
      domProtectionCleanupRef.current = null;
      try { univerRef.current?.dispose?.(); } catch { /* noop */ }
      univerRef.current = null;
      apiRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbookData]);

  // --- Apply visual state for deletes/inserts/errors (background tint) ---
  const applyRowStyle = useCallback((row: number, styleName: string | null) => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const wb = api.getActiveWorkbook?.();
      const sheet = wb?.getActiveSheet?.();
      if (!sheet) return;
      const range = sheet.getRange(row, 0, 1, N_COLS);
      if (styleName === null) {
        // Reset — set undefined background
        range.setBackground?.(null);
      } else if (styleName === "sDeletedRow") {
        range.setBackground?.("#fecaca");
        range.setFontColor?.("#991b1b");
      } else if (styleName === "sInsertedRow") {
        range.setBackground?.("#dcfce7");
      } else if (styleName === "sErrorRow") {
        range.setBackground?.("#fee2e2");
      }
    } catch (e) {
      console.warn("[BPUniverSpike] applyRowStyle failed", e);
    }
  }, []);

  // Refresh visual state APÓS cada rebuild: reaplica dirty (edições), marca deletes,
  // marca inserted rows e foca a Descrição da linha nova (se houver focusInsertTempId).
  useEffect(() => {
    if (!ready) return;
    const api = apiRef.current;
    const wb = api?.getActiveWorkbook?.();
    const sheet = wb?.getActiveSheet?.();
    if (!sheet) return;

    // 1) Reaplicar dirty (as linhas mudaram de número após rebuild)
    const { draft: replayDraft, converted, removed } = sanitizeDraftPayload({ edits: dirtyRef.current, inserts: [], deletes: [] });
    if (converted > 0 || removed > 0) {
      setDirty(replayDraft.edits ?? {});
      if (removed > 0) toast.warning(draftRemovalMessage(removed));
    }
    const d = replayDraft.edits ?? {};
    // Toda esta reaplicação é programática — não pode alimentar dirty via listener.
    isProgrammaticWriteRef.current = true;
    try {
      const rowsToRecalc = new Set<number>();
      for (const [id, delta] of Object.entries(d)) {
        const row = entryIdToRowRef.current.get(id);
        if (row == null) continue;
        try {
          if (delta.description !== undefined) sheet.getRange(row, COL.RUBRIC, 1, 1).setValue?.(delta.description ?? "");
          if (delta.category_id !== undefined) {
            const label = delta.category_id ? categoryIdToLabelRef.current.get(delta.category_id) ?? "" : "";
            sheet.getRange(row, COL.CATEGORY, 1, 1).setValue?.(label);
          }
          if (delta.specification !== undefined) sheet.getRange(row, COL.SPEC, 1, 1).setValue?.(delta.specification ?? "");
          if (delta.amount !== undefined) { sheet.getRange(row, COL.AMOUNT, 1, 1).setValue?.(Number(delta.amount) || 0); rowsToRecalc.add(row); }
          if (delta.iva_rate !== undefined) { sheet.getRange(row, COL.IVA, 1, 1).setValue?.(Number(delta.iva_rate) || 0); rowsToRecalc.add(row); }
          if (delta.formalidade !== undefined) sheet.getRange(row, COL.FORMALIDADE, 1, 1).setValue?.(enumToLabel(delta.formalidade));
        } catch { /* noop */ }
      }
      // Reescrever F (fórmula + valor) para cada linha tocada força o motor a recalcular
      // essa célula E propaga aos subtotais SUM acima. Substitui getFormula().executeCalculation
      // (API não garantida em @univerjs/presets 0.25).
      for (const row of rowsToRecalc) forceRecalcFormula(sheet, row);
    } finally {
      requestAnimationFrame(() => { isProgrammaticWriteRef.current = false; });
    }

    // 2) Marcar linhas apagadas
    for (const id of pendingDeletes) {
      const row = entryIdToRowRef.current.get(id);
      if (row != null) applyRowStyle(row, "sDeletedRow");
    }

    // 3) Focar linha nova se pedido
    if (focusInsertTempId) {
      for (const [rr, tid] of insertRowToTempIdRef.current) {
        if (tid === focusInsertTempId) {
          try { sheet.getRange(rr, COL.RUBRIC, 1, 1)?.activate?.(); } catch { /* noop */ }
          break;
        }
      }
      setFocusInsertTempId(null);
    }
  }, [pendingDeletes, ready, applyRowStyle, workbookData, focusInsertTempId, forceRecalcFormula]);

  // --- Validation ---
  const validate = useCallback((dirtyToValidate: Record<string, Partial<Entry>> = dirty) => {
    const problems: { row: number; entryLabel: string; problems: string[] }[] = [];
    const catLabelToId = categoryLabelToIdRef.current;
    const categoryIds = new Set(l3Categories.map((c) => c.id));

    // Existing rows with dirty
    for (const [id, delta] of Object.entries(dirtyToValidate)) {
      const original = originalEntriesRef.current.get(id);
      if (!original) continue;
      const row = entryIdToRowRef.current.get(id) ?? -1;
      const merged = { ...original, ...delta } as Entry;
      const label = merged.description ?? original.description ?? "(sem descrição)";
      const errs: string[] = [];
      if (!merged.description || !String(merged.description).trim()) errs.push("descrição em falta");
      if (!merged.category_id) errs.push("categoria em falta");
      else if (!categoryIds.has(merged.category_id)) errs.push("categoria inválida (não é L3 expense)");
      if (merged.amount == null || isNaN(Number(merged.amount)) || Number(merged.amount) < 0) errs.push("valor inválido (≥ 0)");
      if (merged.iva_rate == null || !(VALID_IVA as readonly number[]).includes(merged.iva_rate as number)) errs.push("IVA deve ser 0, 6, 13 ou 23");
      if (!merged.formalidade) errs.push("formalidade em falta");
      if (errs.length) problems.push({ row, entryLabel: label, problems: errs });
    }
    // New inserts
    for (const ins of pendingInserts) {
      const row = -1; // we'll try to find it below
      const label = ins.description || "(nova linha)";
      const errs: string[] = [];
      if (!ins.description || !ins.description.trim()) errs.push("descrição em falta");
      if (!ins.category_id) errs.push("categoria em falta");
      else if (!categoryIds.has(ins.category_id)) errs.push("categoria inválida");
      if (ins.amount == null || isNaN(Number(ins.amount)) || Number(ins.amount) < 0) errs.push("valor inválido");
      if (!(VALID_IVA as readonly number[]).includes(ins.iva_rate)) errs.push("IVA inválido");
      if (!ins.formalidade) errs.push("formalidade em falta");
      if (errs.length) {
        // find visual row for the temp
        let visualRow = row;
        for (const [rr, tid] of insertRowToTempIdRef.current) {
          if (tid === ins.tempId) { visualRow = rr; break; }
        }
        problems.push({ row: visualRow, entryLabel: label, problems: errs });
      }
    }
    return problems;
  }, [dirty, pendingInserts, l3Categories]);

  // --- Save ---
  const handleSave = async () => {
    if (saving) return;
    const { edits: normalizedDirty, normalizedFields } = normalizeRecoveredEditValues(dirtyRef.current, categoryLabelLookup);
    const { edits: effectiveDirty, prunedRows, prunedFields } = pruneNoOpEdits(normalizedDirty, originalEntriesRef.current);
    const effectiveHasChanges = Object.keys(effectiveDirty).length + pendingInserts.length + pendingDeletes.length > 0;
    dirtyRef.current = effectiveDirty;
    setDirty(effectiveDirty);
    if (!effectiveHasChanges) {
      try { localStorage.removeItem(draftKey); } catch { /* noop */ }
      toast.info("Sem alterações para gravar.");
      return;
    }
    // Clear previous error highlights
    setValidationErrors([]);
    for (const r of entryRowsRef.current) {
      if (!pendingDeletes.some((id) => entryIdToRowRef.current.get(id) === r)) {
        applyRowStyle(r, null);
      }
    }

    if (normalizedFields > 0 || prunedRows > 0 || prunedFields > 0) {
      setDirty(effectiveDirty);
      try {
        if (!effectiveHasChanges) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ savedAt: new Date().toISOString(), edits: effectiveDirty, inserts: pendingInserts, deletes: pendingDeletes }));
      } catch { /* noop */ }
    }

    const errs = validate(effectiveDirty);
    if (errs.length) {
      setValidationErrors(errs);
      // Highlight
      for (const e of errs) if (e.row >= 0) applyRowStyle(e.row, "sErrorRow");
      toast.error(`${errs.length} linha(s) com problemas — corrija antes de gravar.`);
      return;
    }

    setSaving(true);
    try {

      // 1) Updates
      const editsArr = Object.entries(effectiveDirty).map(([id, fields]) => ({ id, ...fields }));
      if (editsArr.length) {
        const { error } = await supabase.rpc("batch_update_event_forecasts" as any, {
          _event_id: EVENT_ID,
          _version_id: null,
          _edits: editsArr as any,
        } as any);
        if (error) throw error;
      }

      // 2) Inserts
      if (pendingInserts.length) {
        const payload = pendingInserts.map((p) => ({
          type: "expense",
          description: p.description.trim(),
          specification: p.specification ?? null,
          category_id: p.category_id,
          amount: p.amount,
          iva_rate: p.iva_rate,
          formalidade: p.formalidade,
        }));
        const { error } = await supabase.rpc("batch_insert_event_forecasts" as any, {
          _event_id: EVENT_ID,
          _version_id: null,
          _inserts: payload as any,
        } as any);
        if (error) throw error;
      }

      // 3) Deletes
      if (pendingDeletes.length) {
        const { error } = await supabase
          .from("event_forecasts")
          .delete()
          .in("id", pendingDeletes);
        if (error) throw error;
      }

      toast.success(
        `${editsArr.length + pendingInserts.length + pendingDeletes.length} alteração(ões) gravada(s) · ${editsArr.length} edições · ${pendingInserts.length} inseridas · ${pendingDeletes.length} apagadas.`,
      );
      // Clear draft + state
      try { localStorage.removeItem(draftKey); } catch { /* noop */ }
      setDirty({});
      setPendingInserts([]);
      setPendingDeletes([]);
      setActionLog([]);
      setValidationErrors([]);
      // Reload
      await fetchData();
      // Force Univer rebuild by disposing and re-creating (workbookData memo changes with entries)
      try {
        univerRef.current?.dispose?.();
        univerRef.current = null;
        apiRef.current = null;
        setReady(false);
      } catch { /* noop */ }
    } catch (e: any) {
      toast.error("Erro ao gravar: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  // --- Delete selected row ---
  const handleDeleteSelectedClick = () => {
    const api = apiRef.current;
    if (!api) {
      toast.error("Grelha ainda não está pronta. Tenta novamente.");
      return;
    }
    // A seleção "ativa" do Univer volta a null após um rebuild (dispose+create)
    // até o utilizador clicar de novo. Cair para o último range capturado pelo
    // onSelectionChange evita o silent-fail depois de inserir/apagar.
    const wb = api.getActiveWorkbook?.();
    const active = wb?.getActiveRange?.();
    const normalized = normalizeRange(active) ?? selectionRangesRef.current[0] ?? null;
    if (!normalized) {
      toast.info("Seleciona primeiro uma linha de lançamento para apagar.");
      return;
    }
    const row = normalized.startRow;
    const entryId = rowToEntryIdRef.current.get(row);
    if (!entryId) {
      // Insert row? — apenas remove do state; o rebuild elimina a linha da grelha
      const tempId = insertRowToTempIdRef.current.get(row);
      if (tempId) {
        setPendingInserts((prev) => prev.filter((r) => r.tempId !== tempId));
        setActionLog((log) => [...log, { kind: "insert", data: { tempId } }]);
        toast.success("Linha nova removida.");
        return;
      }
      toast.info("Seleciona uma linha de lançamento (não subtotal/cabeçalho) para apagar.");
      return;
    }
    const original = originalEntriesRef.current.get(entryId);
    if (!original) {
      toast.error("Não consegui recuperar os dados originais desta linha. Recarrega a página.");
      return;
    }
    setConfirmDelete({
      id: entryId,
      label: original.description ?? "(sem descrição)",
      amount: original.amount,
    });
  };


  const confirmDeleteApply = () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setPendingDeletes((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActionLog((log) => [...log, { kind: "delete", data: { id } }]);
    const row = entryIdToRowRef.current.get(id);
    if (row != null) applyRowStyle(row, "sDeletedRow");
    setConfirmDelete(null);
    toast.info("Linha marcada para apagar (só ao gravar).");
  };

  // --- Insert new row (INLINE — sem modal, integrado na árvore) ---
  // Adiciona a InsertRow ao state; o rebuild coloca-a DENTRO do grupo da categoria
  // (ou no grupo "⚠ Sem categoria" se sem categoria) e recalcula subtotais SUM
  // corretamente. As edições pendentes são reaplicadas pelo efeito de rebuild.
  const handleInsertInline = () => {
    const api = apiRef.current;
    if (!api) { toast.error("Univer ainda não está pronto."); return; }
    const wb = api.getActiveWorkbook?.();
    if (!wb) { toast.error("Folha não disponível."); return; }

    // Descobrir categoria herdada a partir da célula ativa (walk-up)
    let inheritedCatId: string | null = null;
    try {
      const active = wb.getActiveRange?.();
      const activeRow = normalizeRange(active)?.startRow;
      if (typeof activeRow === "number") {
        for (let r = activeRow; r >= 0; r--) {
          const eid = rowToEntryIdRef.current.get(r);
          if (eid) {
            const overrideCat = (dirty[eid]?.category_id ?? undefined);
            const original = originalEntriesRef.current.get(eid);
            inheritedCatId = (overrideCat !== undefined ? overrideCat : original?.category_id) ?? null;
            break;
          }
          const tempId = insertRowToTempIdRef.current.get(r);
          if (tempId) {
            const ins = pendingInserts.find((p) => p.tempId === tempId);
            inheritedCatId = ins?.category_id ?? null;
            break;
          }
        }
      }
    } catch { /* noop */ }

    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const insertRow: InsertRow = {
      tempId,
      category_id: inheritedCatId,
      description: "",
      specification: null,
      amount: 0,
      iva_rate: 23,
      formalidade: "estimado",
    };
    setPendingInserts((prev) => [...prev, insertRow]);
    setActionLog((log) => [...log, { kind: "insert", data: { tempId } }]);
    setFocusInsertTempId(tempId); // efeito de rebuild vai focar a Descrição
    const catLabel = inheritedCatId ? categoryIdToLabelRef.current.get(inheritedCatId) ?? "" : "";
    if (catLabel) {
      toast.success(`Linha adicionada em ${catLabel}. Preencha a Descrição.`);
    } else {
      toast.info("Linha adicionada em «⚠ Sem categoria». Escolha uma categoria L3.");
    }
  };


  // --- Undo (native Univer for cell edits + logical for insert/delete) ---
  const handleUndo = () => {
    const api = apiRef.current;
    if (!api) return;
    const wb = api.getActiveWorkbook?.();
    const sheet = wb?.getActiveSheet?.();
    const originals = originalEntriesRef.current;

    const writeField = (row: number, field: keyof Entry, val: any) => {
      if (!sheet) return;
      switch (field) {
        case "description":
          sheet.getRange(row, COL.RUBRIC, 1, 1)?.setValue?.(val == null ? "" : String(val));
          break;
        case "category_id": {
          const label = val ? (categoryIdToLabelRef.current.get(val) ?? "") : "";
          sheet.getRange(row, COL.CATEGORY, 1, 1)?.setValue?.(label);
          break;
        }
        case "specification":
          sheet.getRange(row, COL.SPEC, 1, 1)?.setValue?.(val == null ? "" : String(val));
          break;
        case "amount":
          sheet.getRange(row, COL.AMOUNT, 1, 1)?.setValue?.(typeof val === "number" ? val : Number(val) || 0);
          break;
        case "iva_rate":
          sheet.getRange(row, COL.IVA, 1, 1)?.setValue?.(typeof val === "number" ? val : Number(val) || 0);
          break;
        case "formalidade":
          sheet.getRange(row, COL.FORMALIDADE, 1, 1)?.setValue?.(enumToLabel(val));
          break;
        default:
          break;
      }
    };

    // First try to unwind last logical action
    if (actionLog.length) {
      const last = actionLog[actionLog.length - 1];
      if (last.kind === "delete") {
        setPendingDeletes((prev) => prev.filter((id) => id !== last.data.id));
        const row = entryIdToRowRef.current.get(last.data.id);
        if (row != null) applyRowStyle(row, null);
        setActionLog((log) => log.slice(0, -1));
        toast.success("Remoção desfeita.");
        return;
      }
      if (last.kind === "insert") {
        // Só remove do state — rebuild elimina a linha da grelha
        setPendingInserts((prev) => prev.filter((r) => r.tempId !== last.data.tempId));
        setActionLog((log) => log.slice(0, -1));
        toast.success("Inserção desfeita.");
        return;
      }
      if (last.kind === "edit") {
        const { prevEntry, prevInsert, rowsAffected } = last.data || {};
        isProgrammaticWriteRef.current = true;
        try {
          for (const [id, snap] of Object.entries(prevEntry ?? {})) {
            const row = entryIdToRowRef.current.get(id);
            if (row == null) continue;
            for (const [field, val] of Object.entries(snap as any)) {
              writeField(row, field as keyof Entry, val);
            }
          }
          for (const [tempId, snap] of Object.entries(prevInsert ?? {})) {
            const rowEntry = [...insertRowToTempIdRef.current.entries()].find(([, t]) => t === tempId);
            const row = rowEntry ? rowEntry[0] : null;
            if (row == null) continue;
            for (const [field, val] of Object.entries(snap as any)) {
              writeField(row, field as keyof Entry, val);
            }
          }
          if (sheet && Array.isArray(rowsAffected)) {
            for (const r of rowsAffected) forceRecalcFormula(sheet, r);
          }
        } finally {
          requestAnimationFrame(() => { isProgrammaticWriteRef.current = false; });
        }

        setDirty((prev) => {
          const { edits: normalizedPrev } = normalizeRecoveredEditValues(prev, categoryLabelLookup);
          const { edits: effectivePrev } = pruneNoOpEdits(normalizedPrev, originals);
          const next = { ...effectivePrev };
          for (const [id, snap] of Object.entries(prevEntry ?? {})) {
            const original = originals.get(id);
            const merged = { ...(next[id] ?? {}) };
            for (const [field, val] of Object.entries(snap as any)) {
              const origVal = original ? (original as any)[field] : undefined;
              if (entryFieldEquals(origVal, val)) {
                delete (merged as any)[field];
              } else {
                (merged as any)[field] = val;
              }
            }
            if (Object.keys(merged).length === 0) delete next[id];
            else next[id] = merged;
          }
          dirtyRef.current = next;
          return next;
        });

        if (prevInsert && Object.keys(prevInsert).length) {
          setPendingInserts((prev) =>
            prev.map((row) => {
              const snap = (prevInsert as any)[row.tempId];
              if (!snap) return row;
              return { ...row, ...snap } as InsertRow;
            }),
          );
        }

        setActionLog((log) => log.slice(0, -1));
        toast.success("Edição desfeita.");
        return;
      }
    }

    const { edits: normalizedDirty } = normalizeRecoveredEditValues(dirtyRef.current, categoryLabelLookup);
    const { edits: effectiveDirty } = pruneNoOpEdits(normalizedDirty, originals);
    const selectedRange = normalizeRange(wb?.getActiveRange?.()) ?? selectionRangesRef.current[0] ?? null;
    const selectedEntryId = selectedRange ? rowToEntryIdRef.current.get(selectedRange.startRow) : undefined;
    const dirtyIds = Object.keys(effectiveDirty);

    if (pendingDeletes.length) {
      const id = pendingDeletes[pendingDeletes.length - 1];
      setPendingDeletes((prev) => prev.slice(0, -1));
      const row = entryIdToRowRef.current.get(id);
      if (row != null) applyRowStyle(row, null);
      toast.success("Remoção desfeita.");
      return;
    }

    if (pendingInserts.length) {
      setPendingInserts((prev) => prev.slice(0, -1));
      toast.success("Inserção desfeita.");
      return;
    }

    if (dirtyIds.length) {
      const id = selectedEntryId && effectiveDirty[selectedEntryId]
        ? selectedEntryId
        : dirtyIds[dirtyIds.length - 1];
      const original = originals.get(id);
      if (!original) return;
      const row = entryIdToRowRef.current.get(id);
      const fields = Object.keys(effectiveDirty[id] ?? {}) as (keyof Entry)[];
      isProgrammaticWriteRef.current = true;
      try {
        if (row != null) {
          for (const field of fields) writeField(row, field, (original as any)[field]);
          if (fields.includes("amount") || fields.includes("iva_rate")) forceRecalcFormula(sheet, row);
        }
      } finally {
        requestAnimationFrame(() => { isProgrammaticWriteRef.current = false; });
      }
      setDirty(() => {
        const next = { ...effectiveDirty };
        delete next[id];
        dirtyRef.current = next;
        return next;
      });
      toast.success("Edição desfeita.");
      return;
    }

    // Otherwise trigger native Univer undo (cell edits)
    try {
      const commands = [
        "univer.command.undo",
        "doc.command.undo",
        "sheet.command.undo",
      ];
      for (const cmd of commands) {
        try {
          const res = (api as any).executeCommand?.(cmd);
          if (res) break;
        } catch { /* try next */ }
      }
    } catch (e) {
      console.warn("[BPUniverSpike] undo failed", e);
    }
  };

  // Ctrl/Cmd+Z shortcut also feeds our logical undo when nothing else in Univer's undo stack matches
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        // Only intercept when NOT editing a cell (let Univer handle its own)
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        // If we have logical actions, use ours; else let Univer's global handler run
        if (actionLog.length) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionLog]);

  const applyDraft = () => {
    const parsed = pendingDraftRef.current;
    if (!parsed || typeof parsed !== "object") { setDraftPromptOpen(false); return; }
    const { draft: sanitized, removed } = sanitizeDraftPayload(parsed);
    const { edits: normalizedEdits } = normalizeRecoveredEditValues(sanitized.edits ?? {}, categoryLabelLookup);
    const { edits: cleanEdits } = pruneNoOpEdits(normalizedEdits, originalEntriesRef.current);
    // Basta atualizar o state — o rebuild (via workbookData memo) coloca
    // inserts na árvore e o efeito de reaplicação aplica edits/deletes.
    setDirty(cleanEdits);
    setPendingDeletes(sanitized.deletes ?? []);
    setPendingInserts(sanitized.inserts ?? []);
    setDraftPromptOpen(false);
    if (removed > 0) toast.warning(draftRemovalMessage(removed));
    toast.success("Rascunho recuperado.");
  };

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
    pendingDraftRef.current = null;
    setDraftPromptOpen(false);
    toast.info("Rascunho descartado.");
  };

  const discardAllChanges = () => {
    setDirty({});
    setPendingInserts([]);
    setPendingDeletes([]);
    setValidationErrors([]);
    setActionLog([]);
    
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
    toast.success("Alterações descartadas.");
  };


  if (!allowed) return embedded ? null : <Navigate to="/" replace />;

  const entryCount = built?.filter((r) => r.kind === "entry").length ?? 0;
  const subtotalCount = built?.filter((r) => r.kind !== "entry" && r.kind !== "header").length ?? 0;

  const onGraveClick = () => {
    const { edits: normalizedDirty } = normalizeRecoveredEditValues(dirtyRef.current, categoryLabelLookup);
    const { edits: effectiveDirty } = pruneNoOpEdits(normalizedDirty, originalEntriesRef.current);
    dirtyRef.current = effectiveDirty;
    setDirty(effectiveDirty);
    if (Object.keys(effectiveDirty).length + pendingInserts.length + pendingDeletes.length === 0) {
      try { localStorage.removeItem(draftKey); } catch { /* noop */ }
      toast.info("Sem alterações para gravar.");
      return;
    }
    setConfirmSaveOpen(true);
  };

  const editCount = Object.keys(effectiveDirtyForCount).length;
  const insertCount = pendingInserts.length;
  const deleteCount = pendingDeletes.length;

  // Barra de ações — reutilizada no modo normal e no overlay fullscreen
  const actionBar = (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        onClick={onGraveClick}
        disabled={!ready || saving || !hasChanges}
      >
        <Save className="h-4 w-4 mr-2" />
        {saving ? "A gravar…" : `Gravar${hasChanges ? ` (${changeCount})` : ""}`}
      </Button>
      <Button onClick={handleInsertInline} disabled={!ready || saving} variant="outline">
        <Plus className="h-4 w-4 mr-2" />Nova linha
      </Button>
      <Button onClick={handleDeleteSelectedClick} disabled={!ready || saving} variant="outline">
        <Trash2 className="h-4 w-4 mr-2" />Apagar linha
      </Button>
      <Button onClick={handleUndo} disabled={!ready || saving} variant="outline">
        <Undo2 className="h-4 w-4 mr-2" />Desfazer
      </Button>
      <Button variant="outline" onClick={() => setFullscreen((v) => !v)} disabled={!ready}>
        {fullscreen ? <><Minimize2 className="h-4 w-4 mr-2" />Recolher (Esc)</> : <><Maximize2 className="h-4 w-4 mr-2" />Ecrã inteiro</>}
      </Button>
      <span className="text-xs text-muted-foreground ml-2">
        {loading ? "A carregar BP…" : `${entryCount} lançamentos · ${subtotalCount} subtotais · ${l3Categories.length} categorias L3`}
        {ready ? " · Univer pronto" : ""}
      </span>
      {hasChanges && (
        <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300">
          ● {changeCount} alteração(ões) por gravar
        </span>
      )}
    </div>
  );


  return (
    <div className={embedded ? "space-y-3" : "p-6 max-w-[1500px] mx-auto space-y-4"}>
      {!embedded && (
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">BP Univer Spike — Fase 2 (persistência)</h1>
          <p className="text-sm text-muted-foreground">
            Sandbox · Editar em memória, validar e <b>gravar em lote</b> via
            <code className="mx-1">batch_update_event_forecasts</code> +
            <code className="mx-1">batch_insert_event_forecasts</code>.
          </p>
          <div className="text-sm">
            <span className="text-muted-foreground">Evento:</span>{" "}
            <b>{eventName ?? "(a carregar…)"}</b>{" "}
            <code className="ml-2 text-xs text-muted-foreground">{EVENT_ID}</code>
          </div>
        </div>
      )}


      {actionBar}





      {err && (
        <div className="p-3 rounded bg-destructive/10 text-destructive text-sm whitespace-pre-wrap">
          {err}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3 rounded bg-destructive/10 border border-destructive text-sm space-y-1">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {validationErrors.length} linha(s) com problemas — corrija antes de gravar
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 text-xs"
              onClick={() => {
                const first = validationErrors[0];
                if (first && first.row >= 0) {
                  try {
                    const api = apiRef.current;
                    const wb = api?.getActiveWorkbook?.();
                    const sheet = wb?.getActiveSheet?.();
                    sheet?.getRange(first.row, 0, 1, 1)?.activate?.();
                  } catch { /* noop */ }
                }
              }}
            >
              Ir para o primeiro erro
            </Button>
          </div>
          <ul className="list-disc pl-5 text-xs text-destructive space-y-0.5 max-h-32 overflow-auto">
            {validationErrors.map((e, i) => (
              <li key={i}>
                <b>{e.entryLabel}</b>: {e.problems.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fullscreen && (
        <style>{`
          /* Popups do Univer (data validation dropdown, editor, menus, tooltips)
             montam num container no body. Sobem acima do overlay fullscreen. */
          .univer-render-canvas,
          .univer-popup, .univer-dropdown, .univer-menu,
          [class*="univer"][class*="popup"],
          [class*="univer"][class*="dropdown"],
          [class*="univer"][class*="menu"],
          [class*="univer"][class*="overlay"],
          [class*="univer"][class*="tooltip"],
          [data-u-comp*="popup"], [data-u-comp*="dropdown"], [data-u-comp*="menu"] {
            z-index: 10001 !important;
          }
          /* Radix (shadcn AlertDialog/Dialog) — portais no body.
             Cobrimos overlay + content, com e sem data-radix-portal. */
          [data-radix-portal],
          [data-radix-popper-content-wrapper],
          [role="dialog"][data-state="open"],
          [role="alertdialog"][data-state="open"],
          [data-radix-dialog-overlay],
          [data-radix-alert-dialog-overlay] {
            z-index: 10100 !important;
          }
          /* Sonner toasts */
          [data-sonner-toaster] { z-index: 10200 !important; }
        `}</style>
      )}

      <div
        className={
          fullscreen
            ? "fixed inset-0 z-[9999] bg-background flex flex-col"
            : "relative"
        }
        style={
          fullscreen
            ? { width: "100vw", height: "100vh" }
            : { width: "100%", height: "78vh", border: "1px solid hsl(var(--border))" }
        }
      >
        {fullscreen && (
          <div className="shrink-0 border-b bg-background/95 backdrop-blur px-3 py-2 shadow-sm">
            {actionBar}
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", flex: fullscreen ? "1 1 auto" : undefined, height: fullscreen ? undefined : "100%" }} />
      </div>


      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Notas do spike (Fase 2)</summary>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Campos obrigatórios reais BD: <code>event_id, type, description, amount, iva_rate, status, formalidade, company_id</code> (todos com defaults exceto description, amount, event_id). <b>Categoria</b> é nullable em BD mas exigimos L3 na validação.</li>
          <li>Undo: Ctrl/Cmd+Z é nativo Univer para células. O botão "Desfazer" também reverte inserções/remoções lógicas.</li>
          <li>Aviso ao sair: <code>beforeunload</code> nativo (fechar/recarregar). Navegação interna via Link <b>não</b> intercetada (limitação — BrowserRouter não expõe <code>useBlocker</code> de forma estável).</li>
          <li>Rascunho local: em <code>localStorage</code>. Muda de dispositivo/browser → não aparece.</li>
          <li>Linhas novas gravam como <code>status='draft'</code> (RPC fixa). Por isso o spike carrega <code>draft+approved</code>.</li>
        </ul>
      </details>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  Marcar para apagar <b>&quot;{confirmDelete.label}&quot;</b>{" "}
                  ({confirmDelete.amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}).
                  <br />
                  Só é efetivado na BD quando clicar em <b>Gravar</b>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteApply}>Marcar para apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* (modal "Nova linha" removido — inserção agora é inline na grelha) */}


      {/* Draft recovery */}
      <AlertDialog open={draftPromptOpen} onOpenChange={setDraftPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recuperar rascunho não gravado?</AlertDialogTitle>
            <AlertDialogDescription>
              {draftPromptMeta && (
                <>
                  Encontrámos alterações locais de{" "}
                  <b>{new Date(draftPromptMeta.savedAt).toLocaleString("pt-PT")}</b>:{" "}
                  {draftPromptMeta.edits} edição(ões), {draftPromptMeta.inserts} inserção(ões),{" "}
                  {draftPromptMeta.deletes} remoção(ões).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Descartar</AlertDialogCancel>
            <AlertDialogAction onClick={applyDraft}>Recuperar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais gravar <b>{changeCount}</b> alteração(ões) no BP do evento{" "}
              <b>"{eventName ?? EVENT_ID}"</b>:
              <br />
              <ul className="list-disc pl-5 mt-2">
                <li><b>{editCount}</b> edição(ões)</li>
                <li><b>{insertCount}</b> nova(s) linha(s)</li>
                <li><b>{deleteCount}</b> eliminação(ões)</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmSaveOpen(false); void handleSave(); }}
            >
              Gravar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
