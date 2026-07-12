/**
 * BP Univer Spike — Fase 1b: dropdowns (data validation).
 * - Coluna Formalidade: dropdown com labels legíveis (mapa label ↔ enum).
 * - Nova coluna Categoria: dropdown com todas as L3 (código · nome).
 * - Dropdowns só nas linhas de LANÇAMENTO; subtotais continuam protegidos.
 * ⚠️ DO NOT import from production code. Route: /admin/bp-univer-spike (admin only).
 * SEM persistência ainda (Fase 2).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { compareHierarchicalCodes } from "@/lib/utils";
import { buildCategoryLookup, type CategoryLookup } from "@/lib/category-hierarchy";

import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import "@univerjs/preset-sheets-data-validation/lib/index.css";

const EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA 2026

// Formalidade: enum ↔ label
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
// (mantido para Fase 2 — save):
// const labelToEnum = (l: string) => FORMALIDADE_OPTIONS.find((o) => o.label === l)?.value ?? null;

interface Entry {
  id: string;
  category_id: string;
  description: string | null;
  specification: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string | null;
}

type RowKind = "header" | "grand" | "l1" | "l2" | "l3" | "entry";

interface BuiltRow {
  kind: RowKind;
  label: string;
  entry?: Entry;
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
const L_AMOUNT = colLetter(COL.AMOUNT); // D
const L_IVA = colLetter(COL.IVA); // E
const L_TOTAL = colLetter(COL.TOTAL); // F

export default function BPUniverSpike() {
  const { role } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);
  const univerRef = useRef<any>(null);
  const protectedCellsRef = useRef<Set<string>>(new Set()); // "r,c"
  const originalFormulasRef = useRef<Map<string, string>>(new Map()); // "r,c" -> formula
  const entryRowsRef = useRef<number[]>([]); // row indexes of entry rows
  const categoryDropdownRef = useRef<string[]>([]); // labels for L3 dropdown
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const isAdmin = role === "admin" || role === "platform_admin";

  useEffect(() => {
    (async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          supabase
            .from("event_forecasts")
            .select("id, category_id, description, specification, amount, iva_rate, formalidade")
            .eq("event_id", EVENT_ID)
            .is("version_id", null)
            .eq("status", "approved")
            .eq("type", "expense"),
          supabase.from("account_categories").select("id, name, code, parent_id, type"),
        ]);
        if (fRes.error) throw fRes.error;
        if (cRes.error) throw cRes.error;
        setEntries((fRes.data ?? []) as Entry[]);
        setCategories(cRes.data ?? []);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build L3 categories dropdown list (expense only)
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

  const built = useMemo(() => {
    if (!entries.length || !categories.length) return null;
    const lookup: Record<string, CategoryLookup> = buildCategoryLookup(categories as any);

    type L3Bucket = { code: string; name: string; entries: Entry[] };
    type L2Bucket = { code: string; name: string; l3s: Map<string, L3Bucket> };
    type L1Bucket = { code: string; name: string; l2s: Map<string, L2Bucket> };
    const tree = new Map<string, L1Bucket>();

    for (const e of entries) {
      const info = lookup[e.category_id];
      if (!info) continue;
      const l1Code = info.l1Code;
      const l1Name = info.l1Name;
      const l2Code = info.l2Code ?? info.l1Code;
      const l2Name = info.l2Name ?? info.l1Name;
      const l3Code = info.code;
      const l3Name = info.name;
      let l1 = tree.get(l1Code);
      if (!l1) { l1 = { code: l1Code, name: l1Name, l2s: new Map() }; tree.set(l1Code, l1); }
      let l2 = l1.l2s.get(l2Code);
      if (!l2) { l2 = { code: l2Code, name: l2Name, l3s: new Map() }; l1.l2s.set(l2Code, l2); }
      let l3 = l2.l3s.get(l3Code);
      if (!l3) { l3 = { code: l3Code, name: l3Name, entries: [] }; l2.l3s.set(l3Code, l3); }
      l3.entries.push(e);
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

          l3.entries.sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
          for (const e of l3.entries) {
            const eIdx = rows.length;
            rows.push({ kind: "entry", label: "", indent: 4, entry: e });
            rows[l3Idx].childRows!.push(eIdx);
          }
        }
      }
    }
    return rows;
  }, [entries, categories]);

  const workbookData = useMemo(() => {
    if (!built) return null;
    const lookup: Record<string, CategoryLookup> = buildCategoryLookup(categories as any);
    const header = ["Rubrica", "Categoria", "Especificação", "Valor s/IVA", "IVA %", "Total c/IVA", "Formalidade"];
    const cellData: Record<number, Record<number, any>> = {};
    const rowData: Record<number, any> = {};
    const protectedCells = new Set<string>();
    const originalFormulas = new Map<string, string>();
    const entryRows: number[] = [];

    const markProtected = (r: number, c: number) => protectedCells.add(`${r},${c}`);

    cellData[0] = {};
    header.forEach((h, c) => {
      cellData[0][c] = { v: h, s: "sHeader" };
      markProtected(0, c);
    });
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
        const info = lookup[e.category_id];
        const catLabel = info ? `${info.code} · ${info.name}` : "";
        cellData[r][COL.RUBRIC] = { v: e.description ?? "(sem descrição)", s: stLabel };
        cellData[r][COL.CATEGORY] = { v: catLabel, s: st };
        cellData[r][COL.SPEC] = { v: e.specification ?? "", s: st };
        cellData[r][COL.AMOUNT] = { v: e.amount, s: "sMoney" };
        cellData[r][COL.IVA] = { v: e.iva_rate, s: "sIva" };
        const totalFormula = `=${L_AMOUNT}${r + 1}*(1+${L_IVA}${r + 1}/100)`;
        cellData[r][COL.TOTAL] = { f: totalFormula, s: "sMoneyCalc" };
        cellData[r][COL.FORMALIDADE] = { v: enumToLabel(e.formalidade), s: st };
        markProtected(r, COL.TOTAL);
        originalFormulas.set(`${r},${COL.TOTAL}`, totalFormula);
        entryRows.push(r);
      } else {
        cellData[r][COL.RUBRIC] = { v: row.label, s: stLabel };
        cellData[r][COL.CATEGORY] = { v: "", s: st };
        cellData[r][COL.SPEC] = { v: "", s: st };
        const childRefs = (row.childRows ?? []).map((cr) => cr + 1);
        const sumAmount = childRefs.length ? `=` + childRefs.map((rr) => `${L_AMOUNT}${rr}`).join("+") : `=0`;
        const sumTotal = childRefs.length ? `=` + childRefs.map((rr) => `${L_TOTAL}${rr}`).join("+") : `=0`;
        const moneyStyle = row.kind === "grand" ? "sMoneyGrand" : row.kind === "l1" ? "sMoneyL1" : row.kind === "l2" ? "sMoneyL2" : "sMoneyL3";
        cellData[r][COL.AMOUNT] = { f: sumAmount, s: moneyStyle };
        cellData[r][COL.IVA] = { v: "", s: st };
        cellData[r][COL.TOTAL] = { f: sumTotal, s: moneyStyle };
        cellData[r][COL.FORMALIDADE] = { v: "", s: st };
        for (let c = 0; c < N_COLS; c++) markProtected(r, c);
        originalFormulas.set(`${r},${COL.AMOUNT}`, sumAmount);
        originalFormulas.set(`${r},${COL.TOTAL}`, sumTotal);
      }
    });

    protectedCellsRef.current = protectedCells;
    originalFormulasRef.current = originalFormulas;
    entryRowsRef.current = entryRows;
    categoryDropdownRef.current = l3Categories.map((c) => c.label);

    const totalRows = built.length + 5;

    return {
      id: "bp-univer-spike",
      name: "BP Anitta EDA 2026",
      appVersion: "0.25.1",
      locale: LocaleType.EN_US,
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
      },
      sheetOrder: ["sheet1"],
      sheets: {
        sheet1: {
          id: "sheet1",
          name: "BP",
          rowCount: Math.max(totalRows, 200),
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

  // Instantiate Univer
  useEffect(() => {
    if (!containerRef.current || !workbookData || univerRef.current) return;
    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: merge({}, sheetsCoreEnUS) },
        presets: [
          UniverSheetsCorePreset({ container: containerRef.current }),
          UniverSheetsDataValidationPreset(),
        ],
      });
      univerRef.current = univer;
      apiRef.current = univerAPI;
      univerAPI.createWorkbook(workbookData);

      // Apply data validation on entry rows only
      try {
        const wb = univerAPI.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        if (sheet && (univerAPI as any).newDataValidation) {
          for (const r of entryRowsRef.current) {
            // Formalidade dropdown
            const formRule = (univerAPI as any).newDataValidation()
              .requireValueInList(FORMALIDADE_LABELS)
              .setOptions({ allowInvalid: true, showDropdown: true })
              .build();
            sheet.getRange(r, COL.FORMALIDADE, 1, 1).setDataValidation(formRule);

            // Categoria dropdown
            if (categoryDropdownRef.current.length) {
              const catRule = (univerAPI as any).newDataValidation()
                .requireValueInList(categoryDropdownRef.current)
                .setOptions({ allowInvalid: true, showDropdown: true })
                .build();
              sheet.getRange(r, COL.CATEGORY, 1, 1).setDataValidation(catRule);
            }
          }
        } else {
          console.warn("[BPUniverSpike] newDataValidation não disponível na facade API");
        }
      } catch (dvErr) {
        console.warn("[BPUniverSpike] falha a aplicar data validation:", dvErr);
      }

      // Soft protection
      try {
        const wb = univerAPI.getActiveWorkbook?.();
        const Event = (univerAPI as any).Event;
        if (Event && (univerAPI as any).addEvent) {
          (univerAPI as any).addEvent(Event.SheetEditEnded, (params: any) => {
            const { row, column } = params ?? {};
            if (row == null || column == null) return;
            const key = `${row},${column}`;
            if (!protectedCellsRef.current.has(key)) return;
            const sheet = wb?.getActiveSheet?.();
            if (!sheet) return;
            const orig = originalFormulasRef.current.get(key);
            const range = sheet.getRange(row, column, 1, 1);
            if (orig) {
              range.setFormula?.(orig);
            } else {
              range.setValue?.("");
            }
            console.warn(`[BPUniverSpike] linha protegida — edição em (${row},${column}) revertida`);
          });
        }
      } catch (evtErr) {
        console.warn("[BPUniverSpike] não foi possível instalar listener de proteção:", evtErr);
      }

      setReady(true);
    } catch (e: any) {
      setErr("Falha a inicializar Univer: " + (e?.message ?? String(e)));
    }
    return () => {
      try { univerRef.current?.dispose?.(); } catch { /* noop */ }
      univerRef.current = null;
      apiRef.current = null;
    };
  }, [workbookData]);

  const dumpState = () => {
    const api = apiRef.current;
    if (!api) return;
    const wb = api.getActiveWorkbook?.();
    const snapshot = wb?.getSnapshot?.();
    console.log("[BPUniverSpike] snapshot:", snapshot);
    console.log("[BPUniverSpike] built rows:", built);
    console.log("[BPUniverSpike] protected cells:", Array.from(protectedCellsRef.current));
    console.log("[BPUniverSpike] entry rows:", entryRowsRef.current);
    console.log("[BPUniverSpike] L3 categories:", l3Categories);
    alert(`Estado impresso na consola. ${built?.length ?? 0} linhas · ${entryRowsRef.current.length} lançamentos com dropdowns.`);
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const entryCount = built?.filter((r) => r.kind === "entry").length ?? 0;
  const subtotalCount = built?.filter((r) => r.kind !== "entry" && r.kind !== "header").length ?? 0;

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">BP Univer Spike — Fase 1b (dropdowns)</h1>
        <p className="text-sm text-muted-foreground">
          Evento Anitta EDA 2026 · Despesas aprovadas · Hierarquia com subtotais SUM.
          Dropdowns em <b>Categoria</b> (L3) e <b>Formalidade</b> nos lançamentos.
          Nota: ao mudar a categoria de uma linha, ela fica no sítio nesta fase — será
          reposicionada na hierarquia ao guardar (Fase 2, ainda sem persistência).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={dumpState} disabled={!ready}>Ver alterações (consola)</Button>
        <span className="text-xs text-muted-foreground">
          {loading ? "A carregar BP…" : `${entryCount} lançamentos · ${subtotalCount} subtotais · ${l3Categories.length} categorias L3`}
          {ready ? " · Univer pronto" : ""}
        </span>
      </div>

      {err && (
        <div className="p-3 rounded bg-destructive/10 text-destructive text-sm whitespace-pre-wrap">
          {err}
        </div>
      )}

      <div
        ref={containerRef}
        style={{ width: "100%", height: "78vh", border: "1px solid hsl(var(--border))" }}
      />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Notas do spike (Fase 1b)</summary>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Colunas: A Rubrica · B Categoria (dropdown) · C Especificação · D Valor s/IVA · E IVA% · F Total c/IVA · G Formalidade (dropdown).</li>
          <li>Total c/IVA = <code>D*(1+E/100)</code>. Subtotais somam <code>D</code> e <code>F</code> das linhas filhas diretas.</li>
          <li>Formalidade: labels legíveis (Estimado / Em Negociação / Fechado / Pago Parcial / Pago Total) mapeadas ao enum <code>bp_formalidade</code>.</li>
          <li>Categoria: todas as L3 sob raízes de <i>expense</i>, formato <code>código · nome</code>.</li>
          <li>Dropdowns aplicados só nas linhas de lançamento via <code>UniverSheetsDataValidationPreset</code>.</li>
        </ul>
      </details>
    </div>
  );
}
