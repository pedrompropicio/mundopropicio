/**
 * Planilha do BP (Handsontable) — VISTA OFICIAL
 * ============================================
 * Aprovada em 06/08/2026 e substituiu a antiga Planilha (Univer 0.25), aposentada.
 *
 * ⚠️ TODO LICENÇA: em produção comercial é obrigatória licença Handsontable —
 * substituir esta key ("non-commercial-and-evaluation") pela key comprada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { HyperFormula } from "hyperformula";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";
import { useTheme } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, RefreshCw, Maximize2, Minimize2, Undo2, ListPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { compareHierarchicalCodes } from "@/lib/utils";
import { formatCurrencyDecimal } from "@/lib/mock-data";

registerAllModules();

/* ─────────────────────────── constantes / helpers ─────────────────────────── */

const FORMALIDADE_OPTIONS: { value: string; label: string }[] = [
  { value: "estimado", label: "Estimado" },
  { value: "negociacao", label: "Em Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "pago_parcial", label: "Pago Parcial" },
  { value: "pago_total", label: "Pago Total" },
];
const FORMALIDADE_LABELS = FORMALIDADE_OPTIONS.map((o) => o.label);
const enumToLabel = (v: string | null | undefined) =>
  FORMALIDADE_OPTIONS.find((o) => o.value === v)?.label ?? "";
const labelToEnum = (l: string | null | undefined) => {
  const raw = l == null ? "" : String(l).trim();
  if (!raw) return null;
  return FORMALIDADE_OPTIONS.find((o) => o.label === raw || o.value === raw)?.value ?? null;
};

/** Input PT: "1.064,42 €" → 1064.42 (copiado do Univer). */
const parseAmountPT = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[\s€%]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: unknown) => String(v ?? "").trim();
const sameTxt = (a: unknown, b: unknown) => txt(a) === txt(b);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Entry {
  id: string;
  category_id: string | null;
  description: string | null;
  specification: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string | null;
  status?: string;
}
interface Category {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  type: string | null;
}
type RowMeta =
  | { kind: "group"; level: 1 | 2 | 3; categoryId: string | null }
  | { kind: "entry"; id: string; categoryId: string | null; categoryLabel: string }
  | { kind: "entry"; tempId: string; categoryId: string | null; categoryLabel: string };

const COL = { CATEGORY: 0, DESCRIPTION: 1, SPEC: 2, AMOUNT: 3, IVA: 4, TOTAL: 5, FORMALIDADE: 6 };

interface DiffResult {
  edits: { id: string; fields: Record<string, unknown>; label: string }[];
  inserts: {
    category_id: string | null;
    description: string;
    specification: string | null;
    amount: number;
    iva_rate: number;
    formalidade: string;
  }[];
  deletes: string[];
}

interface BPPlanilhaProps {
  eventId: string;
  canEdit?: boolean;
}

export default function BPPlanilha({ eventId, canEdit = true }: BPPlanilhaProps) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  // Mesma regra da antiga Planilha (Univer): quem pode editar o BP pode usar a Planilha.
  const allowed = canEdit;

  const { rates: validIva, defaultRate } = useEventIvaCountry(eventId || null);

  const hotRef = useRef<any>(null);
  const metaRef = useRef<RowMeta[]>([]);
  const originalsRef = useRef<Map<string, Entry>>(new Map());
  const programmaticRef = useRef(false);
  const lastRowRef = useRef<number>(-1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [tempRows, setTempRows] = useState<
    { tempId: string; categoryId: string | null; afterId: string | null }[]
  >([]);
  const [counts, setCounts] = useState({ edits: 0, inserts: 0, deletes: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const { theme } = useTheme();
  const htThemeClass = theme === "dark" ? "ht-theme-main-dark" : "ht-theme-main";

  /* ── Pilha própria de Desfazer (ordem cronológica entre células e estrutura) ──
   * Edições de célula são delegadas ao undo nativo do Handsontable; as ações de
   * estrutura (inserir/apagar linha) vivem aqui. A pilha registra a sequência
   * para o botão "Desfazer" reverter sempre a última ação, seja de que mundo for. */
  type UndoEntry =
    | { kind: "cell"; ts: number }
    | { kind: "insert"; ts: number; tempId: string }
    | { kind: "delete"; ts: number; id: string };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const undoFromButtonRef = useRef(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const pushUndo = useCallback((e: UndoEntry) => {
    undoStackRef.current = [...undoStackRef.current, e];
    setUndoDepth(undoStackRef.current.length);
  }, []);

  // Dialog "Adicionar rubrica"
  const [rubricOpen, setRubricOpen] = useState(false);
  const [rubricFilterL2, setRubricFilterL2] = useState<string | null>(null);
  const [rubricValue, setRubricValue] = useState("");


  // Sair do ecrã inteiro com Esc
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Recalcular dimensões da grelha ao alternar ecrã inteiro
  useEffect(() => {
    const t = setTimeout(() => hotRef.current?.hotInstance?.render?.(), 60);
    return () => clearTimeout(t);
  }, [fullscreen]);

  /* ───────────────────────────── carregamento ───────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const eRes = await supabase.from("events").select("name, company_id").eq("id", eventId).maybeSingle();
      if (eRes.error) throw eRes.error;
      const eventCompanyId = (eRes.data as any)?.company_id ?? null;
      const catQuery = supabase.from("account_categories").select("id, name, code, parent_id, type, company_id");
      const [fRes, cRes] = await Promise.all([
        supabase
          .from("event_forecasts")
          .select("id, category_id, description, specification, amount, iva_rate, formalidade, status")
          .eq("event_id", eventId)
          .is("version_id", null)
          .in("status", ["approved", "draft"])
          .eq("type", "expense"),
        eventCompanyId ? catQuery.eq("company_id", eventCompanyId) : catQuery,
      ]);
      if (fRes.error) throw fRes.error;
      if (cRes.error) throw cRes.error;
      const list = (fRes.data ?? []) as Entry[];
      setEntries(list);
      setCategories((cRes.data ?? []) as Category[]);
      const map = new Map<string, Entry>();
      for (const e of list) map.set(e.id, e);
      originalsRef.current = map;
      setPendingDeletes([]);
      setTempRows([]);
      setCounts({ edits: 0, inserts: 0, deletes: 0 });
      undoStackRef.current = [];
      setUndoDepth(0);
      setDataVersion((v) => v + 1);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const catLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "(sem categoria)";
      const c = catById.get(id);
      return c ? `${c.code ?? ""} ${c.name}`.trim() : "(categoria desconhecida)";
    },
    [catById],
  );

  /* ─────────────────── construção da grelha (L1 > L2 > L3) ─────────────────── */

  const { tableData, rowMeta } = useMemo(() => {
    const data: any[][] = [];
    const meta: RowMeta[] = [];
    const pushFormulaRow = (m: RowMeta, cells: any[]) => {
      const sheetRow = data.length + 1;
      if (m.kind === "entry") {
        cells[COL.TOTAL] = `=D${sheetRow}*(1+E${sheetRow}/100)`;
      }
      data.push(cells);
      meta.push(m);
    };

    // agrupar entries (incluindo linhas novas) por categoria L3
    const byCat = new Map<string, { id?: string; tempId?: string; entry?: Entry; categoryId: string | null }[]>();
    const visible = entries.filter((e) => !pendingDeletes.includes(e.id));
    for (const e of visible) {
      const key = e.category_id ?? "__none__";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push({ id: e.id, entry: e, categoryId: e.category_id });
    }
    for (const t of tempRows) {
      const key = t.categoryId ?? "__none__";
      if (!byCat.has(key)) byCat.set(key, []);
      const arr = byCat.get(key)!;
      const at = t.afterId ? arr.findIndex((x) => x.id === t.afterId) : -1;
      const newRow = { tempId: t.tempId, categoryId: t.categoryId };
      if (at >= 0) arr.splice(at + 1, 0, newRow);
      else arr.push(newRow);
    }

    const ancestors = (id: string | null): Category[] => {
      const chain: Category[] = [];
      let cur = id ? catById.get(id) : undefined;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
      }
      return chain;
    };

    const keys = Array.from(byCat.keys()).sort((a, b) =>
      compareHierarchicalCodes(catById.get(a)?.code ?? "zz", catById.get(b)?.code ?? "zz"),
    );

    const shown = new Set<string>();
    for (const key of keys) {
      const catId = key === "__none__" ? null : key;
      const chain = ancestors(catId);
      chain.forEach((c, idx) => {
        const level = (idx + 1) as 1 | 2 | 3;
        if (level > 3 || shown.has(c.id)) return;
        shown.add(c.id);
        const indent = "    ".repeat(level - 1);
        const cells = new Array(7).fill("");
        cells[COL.CATEGORY] = `${indent}${c.code ?? ""} ${c.name}`.trim();
        cells[COL.AMOUNT] = null;
        cells[COL.IVA] = null;
        data.push(cells);
        meta.push({ kind: "group", level, categoryId: c.id });
      });
      if (!chain.length) {
        const cells = new Array(7).fill("");
        cells[COL.CATEGORY] = "(sem categoria)";
        data.push(cells);
        meta.push({ kind: "group", level: 3, categoryId: null });
      }

      for (const row of byCat.get(key)!) {
        const label = catLabel(catId);
        if (row.entry) {
          pushFormulaRow({ kind: "entry", id: row.entry.id, categoryId: catId, categoryLabel: label }, [
            label,
            row.entry.description ?? "",
            row.entry.specification ?? "",
            Number(row.entry.amount ?? 0),
            Number(row.entry.iva_rate ?? 0),
            "",
            enumToLabel(row.entry.formalidade),
          ]);
        } else {
          pushFormulaRow({ kind: "entry", tempId: row.tempId!, categoryId: catId, categoryLabel: label }, [
            label,
            "",
            "",
            0,
            Number(defaultRate),
            "",
            enumToLabel("estimado"),
          ]);
        }
      }
    }
    return { tableData: data, rowMeta: meta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, pendingDeletes, tempRows, catById, catLabel, defaultRate, dataVersion]);

  useEffect(() => {
    metaRef.current = rowMeta;
  }, [rowMeta]);

  /* ────────────────────────────── diff / contagem ────────────────────────────── */

  const buildDiff = useCallback((): DiffResult => {
    const hot = hotRef.current?.hotInstance;
    const meta = metaRef.current;
    const res: DiffResult = { edits: [], inserts: [], deletes: [...pendingDeletes] };
    if (!hot) return res;

    meta.forEach((m, r) => {
      if (m.kind !== "entry") return;
      const description = txt(hot.getDataAtCell(r, COL.DESCRIPTION));
      const specification = txt(hot.getDataAtCell(r, COL.SPEC));
      const amount = round2(parseAmountPT(hot.getDataAtCell(r, COL.AMOUNT)) ?? 0);
      const iva_rate = parseAmountPT(hot.getDataAtCell(r, COL.IVA)) ?? 0;
      const formalidade = labelToEnum(hot.getDataAtCell(r, COL.FORMALIDADE)) ?? "estimado";

      if ("tempId" in m) {
        res.inserts.push({
          category_id: m.categoryId,
          description,
          specification: specification || null,
          amount,
          iva_rate,
          formalidade,
        });
        return;
      }
      const orig = originalsRef.current.get(m.id);
      if (!orig) return;
      const fields: Record<string, unknown> = {};
      if (!sameTxt(orig.description, description)) fields.description = description || null;
      if (!sameTxt(orig.specification, specification)) fields.specification = specification || null;
      if (round2(Number(orig.amount ?? 0)) !== amount) fields.amount = amount;
      if (Number(orig.iva_rate ?? 0) !== iva_rate) fields.iva_rate = iva_rate;
      if ((orig.formalidade ?? "estimado") !== formalidade) fields.formalidade = formalidade;
      // poda de no-ops: só entra no diff se sobrou pelo menos um campo real
      if (Object.keys(fields).length) {
        res.edits.push({ id: m.id, fields, label: description || orig.description || m.id });
      }
    });
    return res;
  }, [pendingDeletes]);

  const recount = useCallback(() => {
    const d = buildDiff();
    setCounts({ edits: d.edits.length, inserts: d.inserts.length, deletes: d.deletes.length });
  }, [buildDiff]);

  useEffect(() => {
    // recontar quando a estrutura muda (inserir/apagar linha)
    const t = setTimeout(recount, 0);
    return () => clearTimeout(t);
  }, [tempRows, pendingDeletes, recount]);

  const totalChanges = counts.edits + counts.inserts + counts.deletes;

  /* ───────────────────────────── ações estruturais ───────────────────────────── */

  /** Última linha selecionada (fallback: a grelha perde a seleção ao clicar na toolbar). */
  const selectedRow = () => {
    const hot = hotRef.current?.hotInstance;
    const sel = hot?.getSelectedLast?.();
    const r = sel ? sel[0] : -1;
    if (typeof r === "number" && r >= 0) return r;
    return lastRowRef.current;
  };

  /** Cria uma linha nova (draft) na rubrica L3 indicada. */
  const addTempRow = useCallback(
    (categoryId: string | null, afterId: string | null) => {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTempRows((prev) => [...prev, { tempId, categoryId, afterId }]);
      pushUndo({ kind: "insert", ts: Date.now(), tempId });
      setDataVersion((v) => v + 1);
      toast.success("Linha inserida — preenche a descrição e o valor.");
    },
    [pushUndo],
  );

  const insertRow = () => {
    const r = selectedRow();
    const m = r >= 0 ? metaRef.current[r] : undefined;
    if (!m) {
      toast.info("Seleciona uma linha primeiro (uma rubrica L3 ou uma linha dela).");
      return;
    }
    if (m.kind === "group" && m.level !== 3) {
      // L2 (ou L1): abre o dialog de rubricas pré-filtrado a esse grupo
      setRubricFilterL2(m.level === 2 ? m.categoryId : null);
      setRubricValue("");
      setRubricOpen(true);
      return;
    }
    const afterId = m.kind === "entry" && "id" in m ? m.id : null;
    addTempRow(m.categoryId, afterId);
  };

  const deleteRow = () => {
    const r = selectedRow();
    const m = r >= 0 ? metaRef.current[r] : undefined;
    if (!m) {
      toast.info("Seleciona uma linha primeiro.");
      return;
    }
    if (m.kind !== "entry") {
      toast.info("Só é possível apagar linhas de despesa (não cabeçalhos de grupo).");
      return;
    }
    if ("tempId" in m) {
      const tempId = m.tempId;
      setTempRows((prev) => prev.filter((t) => t.tempId !== tempId));
      // desfazer uma inserção pendente = anular a própria entrada da pilha
      undoStackRef.current = undoStackRef.current.filter(
        (e) => !(e.kind === "insert" && e.tempId === tempId),
      );
      setUndoDepth(undoStackRef.current.length);
    } else {
      const id = m.id;
      setPendingDeletes((prev) => (prev.includes(id) ? prev : [...prev, id]));
      pushUndo({ kind: "delete", ts: Date.now(), id });
    }
    lastRowRef.current = -1;
    setDataVersion((v) => v + 1);
    toast.success("Linha marcada para remoção.");
  };

  /** Desfaz a última ação global (célula via undo nativo, estrutura via pilha própria). */
  const handleUndo = () => {
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (!last) {
      toast.info("Nada para desfazer.");
      return;
    }
    undoStackRef.current = stack.slice(0, -1);
    setUndoDepth(undoStackRef.current.length);

    if (last.kind === "cell") {
      hotRef.current?.hotInstance?.undo?.();
      // afterUndo faz o recount
      return;
    }
    if (last.kind === "insert") {
      setTempRows((prev) => prev.filter((t) => t.tempId !== last.tempId));
      toast.success("Linha inserida removida.");
    } else {
      setPendingDeletes((prev) => prev.filter((id) => id !== last.id));
      toast.success("Linha restaurada.");
    }
    setDataVersion((v) => v + 1);
  };

  /* ─────────────── rubricas L3 de despesa (dialog "Adicionar rubrica") ─────────────── */

  const rubricOptions = useMemo<SearchableSelectOption[]>(() => {
    const chainOf = (c: Category): Category[] => {
      const chain: Category[] = [];
      let cur: Category | undefined = c;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
      }
      return chain;
    };
    const opts = categories
      .map((c) => ({ c, chain: chainOf(c) }))
      .filter(({ c, chain }) => {
        if (chain.length !== 3) return false;
        const root = chain[0];
        const type = c.type ?? chain[1]?.type ?? root.type;
        if (type && type !== "expense") return false;
        if (rubricFilterL2 && chain[1]?.id !== rubricFilterL2) return false;
        return true;
      })
      .sort((a, b) => compareHierarchicalCodes(a.c.code ?? "zz", b.c.code ?? "zz"))
      .map(({ c, chain }) => ({
        value: c.id,
        label: `${c.code ?? ""} ${c.name}`.trim(),
        group: `${chain[1]?.code ?? ""} ${chain[1]?.name ?? ""}`.trim() || "Outros",
        searchText: `${chain[0]?.name ?? ""} ${chain[1]?.name ?? ""}`,
      }));
    return opts;
  }, [categories, catById, rubricFilterL2]);

  const confirmRubric = () => {
    if (!rubricValue) {
      toast.info("Escolhe uma rubrica.");
      return;
    }
    addTempRow(rubricValue, null);
    setRubricOpen(false);
    setRubricValue("");
    setRubricFilterL2(null);
  };



  /* ──────────────────────────────── gravação ──────────────────────────────── */

  const handleSave = async () => {
    if (saving) return;
    const diff = buildDiff();
    if (!diff.edits.length && !diff.inserts.length && !diff.deletes.length) {
      toast.info("Sem alterações para gravar.");
      return;
    }
    const badInsert = diff.inserts.find((i) => !i.description || !i.category_id);
    if (badInsert) {
      toast.error("Linhas novas precisam de rubrica (descrição) e categoria.");
      return;
    }
    const invalidIva = [...diff.edits.map((e) => e.fields.iva_rate), ...diff.inserts.map((i) => i.iva_rate)]
      .filter((v) => v !== undefined)
      .find((v) => !(validIva as number[]).includes(Number(v)));
    if (invalidIva !== undefined) {
      toast.error(`Taxa de IVA inválida para este evento: ${invalidIva}%`);
      return;
    }

    setSaving(true);
    try {
      if (diff.edits.length) {
        const editsArr = diff.edits.map((e) => ({ id: e.id, ...e.fields }));
        const { data, error } = await supabase.rpc("batch_update_event_forecasts" as any, {
          _event_id: eventId,
          _version_id: null,
          _edits: editsArr as any,
        } as any);
        if (error) throw error;
        const updated = Number((data as any)?.updated ?? 0);
        if (updated !== editsArr.length) {
          throw new Error(`A base confirmou ${updated}/${editsArr.length} edição(ões). Tente gravar novamente.`);
        }
      }
      if (diff.inserts.length) {
        const { error } = await supabase.rpc("batch_insert_event_forecasts" as any, {
          _event_id: eventId,
          _version_id: null,
          _inserts: diff.inserts.map((p) => ({ type: "expense", ...p })) as any,
        } as any);
        if (error) throw error;
      }
      if (diff.deletes.length) {
        const { error } = await supabase.from("event_forecasts").delete().in("id", diff.deletes);
        if (error) throw error;
      }
      toast.success(
        `${diff.edits.length} editada(s) · ${diff.inserts.length} inserida(s) · ${diff.deletes.length} removida(s).`,
      );
      // Refresh das vistas que leem event_forecasts + cards financeiros do evento
      for (const key of [
        ["event_forecasts"],
        ["event-forecasts"],
        ["forecasts"],
        ["bp"],
        ["partner-bp-realized"],
        ["scenario-forecasts"],
        ["adopted_forecasts"],
        ["parent_event_forecasts"],
        ["efc-forecasts"],
        ["efc-tx"],
      ]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      await fetchData();

    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  /* ───────────────────────────────── render ───────────────────────────────── */

  const ivaSource = useMemo(() => (validIva as number[]).map((r) => String(r)), [validIva]);

  /**
   * Renderers PT-PT: a formatação é SÓ visual — o valor subjacente continua
   * numérico e a edição com vírgula (parseAmountPT/beforeChange) fica intacta.
   */
  const moneyRenderer = useCallback(
    (_inst: any, td: HTMLElement, _r: number, _c: number, _p: any, value: any, cellProps: any) => {
      td.className = `htRight${cellProps?.className ? ` ${cellProps.className}` : ""}`;
      const n = typeof value === "number" ? value : parseAmountPT(value);
      if (n === null || n === undefined || !Number.isFinite(n)) {
        td.textContent = "";
        td.style.color = "";
        return;
      }
      td.textContent = formatCurrencyDecimal(n);
      td.style.color = n < 0 ? "hsl(var(--destructive))" : "";
    },
    [],
  );

  const ivaRenderer = useCallback(
    (_inst: any, td: HTMLElement, _r: number, _c: number, _p: any, value: any, cellProps: any) => {
      td.className = `htRight${cellProps?.className ? ` ${cellProps.className}` : ""}`;
      const n = parseAmountPT(value);
      td.textContent = n === null ? "" : `${n}%`;
    },
    [],
  );

  /** Indentação hierárquica na coluna Categoria (mesmo padrão visual da v1). */
  const categoryRenderer = useCallback(
    (_inst: any, td: HTMLElement, r: number, _c: number, _p: any, value: any, cellProps: any) => {
      td.className = cellProps?.className ?? "";
      const m = metaRef.current[r];
      const text = String(value ?? "").trim();
      td.textContent = text;
      td.style.fontWeight = "";
      td.style.color = "";
      td.style.paddingLeft = "";
      if (!m) return;
      if (m.kind === "group") {
        td.style.paddingLeft = `${4 + (m.level - 1) * 16}px`;
        td.style.fontWeight = m.level === 1 ? "700" : m.level === 2 ? "600" : "600";
        if (m.level === 3) td.style.color = "hsl(var(--foreground))";
      } else {
        td.style.paddingLeft = "48px";
        td.style.color = "hsl(var(--muted-foreground))";
      }
    },
    [],
  );

  const columns = useMemo(
    () => [
      { data: COL.CATEGORY, readOnly: true, width: 300, renderer: categoryRenderer as any },
      { data: COL.DESCRIPTION, type: "text", width: 300 },
      { data: COL.SPEC, type: "text", width: 220 },
      { data: COL.AMOUNT, type: "numeric", width: 140, renderer: moneyRenderer as any },
      {
        data: COL.IVA,
        type: "dropdown",
        source: ivaSource,
        allowInvalid: false,
        width: 90,
        renderer: ivaRenderer as any,
      },
      { data: COL.TOTAL, readOnly: true, type: "numeric", width: 150, renderer: moneyRenderer as any },
      { data: COL.FORMALIDADE, type: "dropdown", source: FORMALIDADE_LABELS, allowInvalid: false, width: 150 },
    ],
    [ivaSource, moneyRenderer, ivaRenderer, categoryRenderer],
  );



  if (!allowed) {
    return (
      <div className="glass rounded-xl p-6 text-sm text-muted-foreground">
        Não tens permissão para editar o BP deste evento.
      </div>
    );
  }

  const actionBar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {totalChanges > 0
            ? `${totalChanges} alteração(ões) pendente(s) — ${counts.edits} editadas · ${counts.inserts} inseridas · ${counts.deletes} removidas`
            : "Sem alterações pendentes"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleUndo} disabled={undoDepth === 0}>
          <Undo2 className="mr-1 h-3.5 w-3.5" /> Desfazer
        </Button>
        <Button size="sm" variant="outline" onClick={insertRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Inserir linha
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRubricFilterL2(null);
            setRubricValue("");
            setRubricOpen(true);
          }}
        >
          <ListPlus className="mr-1 h-3.5 w-3.5" /> Adicionar rubrica
        </Button>
        <Button size="sm" variant="outline" onClick={deleteRow}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar linha
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void fetchData()} disabled={loading || saving}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Recarregar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? (
            <>
              <Minimize2 className="mr-1 h-3.5 w-3.5" /> Recolher (Esc)
            </>
          ) : (
            <>
              <Maximize2 className="mr-1 h-3.5 w-3.5" /> Ecrã inteiro
            </>
          )}
        </Button>
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={saving || totalChanges === 0}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          Gravar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {actionBar}

      {err && <p className="text-sm text-destructive">{err}</p>}

      <style>{`
        .handsontable td.bpv2-group { background: hsl(var(--muted)) !important; }
        .handsontable td.bpv2-l3 { background: hsl(var(--secondary)) !important; }
      `}</style>


      {fullscreen && (
        <style>{`
          /* Dropdowns/editores do Handsontable montam em containers no body */
          .handsontable .htDropdownMenu, .handsontable .htContextMenu,
          .htDropdownMenu, .htContextMenu, .handsontable.listbox,
          .htAutocompleteArrow, .ht_clone_top, .ht_clone_left { z-index: 10001 !important; }
          [data-radix-portal], [data-radix-popper-content-wrapper],
          [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"] { z-index: 10100 !important; }
          [data-sonner-toaster] { z-index: 10200 !important; }
        `}</style>
      )}

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar dados…</p>
      ) : (
        <div
          key={htThemeClass}
          className={
            fullscreen
              ? `fixed inset-0 z-[9999] flex flex-col bg-background p-3 ${htThemeClass}`
              : `${htThemeClass} overflow-hidden rounded-xl border border-border`
          }
        >
          {fullscreen && (
            <div className="mb-2 shrink-0 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
              {actionBar}
            </div>
          )}

          <HotTable
            ref={hotRef}
            data={tableData}
            columns={columns as any}
            colHeaders={[
              "Categoria",
              "Descrição",
              "Especificação",
              "Valor s/IVA",
              "Taxa IVA",
              "Total c/IVA",
              "Formalidade",
            ]}
            rowHeaders
            height={fullscreen ? "calc(100vh - 100px)" : 620}
            width="100%"
            stretchH="last"
            undo
            manualColumnResize
            contextMenu={false}
            outsideClickDeselects={false}
            afterSelectionEnd={(r: number) => {
              if (typeof r === "number" && r >= 0) lastRowRef.current = r;
            }}
            // HyperFormula alimenta a coluna "Total c/IVA" (=D*(1+E/100)).
            formulas={{ engine: HyperFormula, licenseKey: "internal-use-in-handsontable" }}
            licenseKey="non-commercial-and-evaluation"
            cells={(row) => {
              const m = metaRef.current[row];
              if (!m) return {};
              if (m.kind === "group") {
                return {
                  readOnly: true,
                  className: m.level === 3 ? "bpv2-l3" : "bpv2-group",
                };
              }
              return {};
            }}
            beforeChange={(changes, source) => {
              if (!changes) return;
              if (source === "loadData") return;
              for (const change of changes) {
                if (!change) continue;
                const [, prop, , newVal] = change as [number, number, any, any];
                if (prop === COL.AMOUNT) {
                  const n = parseAmountPT(newVal);
                  change[3] = n === null ? null : round2(n);
                } else if (prop === COL.IVA) {
                  const n = parseAmountPT(newVal);
                  change[3] = n === null ? null : String(n);
                }
              }
            }}
            afterChange={(changes, source) => {
              if (!changes) return;
              if (source === "loadData" || programmaticRef.current) return;
              if (source !== "UndoRedo.undo" && source !== "UndoRedo.redo") {
                pushUndo({ kind: "cell", ts: Date.now() });
              }
              recount();
            }}
            afterUndo={() => {
              // Ctrl+Z nativo: remove da pilha a última edição de célula
              const idx = [...undoStackRef.current].reverse().findIndex((e) => e.kind === "cell");
              if (idx >= 0) {
                const at = undoStackRef.current.length - 1 - idx;
                undoStackRef.current = undoStackRef.current.filter((_, i) => i !== at);
                setUndoDepth(undoStackRef.current.length);
              }
              recount();
            }}
            afterRedo={() => {
              pushUndo({ kind: "cell", ts: Date.now() });
              recount();
            }}
          />
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar gravação</DialogTitle>
            <DialogDescription>
              {counts.edits} linha(s) editada(s) · {counts.inserts} inserida(s) (entram como rascunho) ·{" "}
              {counts.deletes} removida(s).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
