/**
 * BP Univer Spike — Fase 1: Layout hierárquico (L1>L2>L3>lançamentos) com subtotais SUM.
 * ⚠️ DO NOT import from production code. Route: /admin/bp-univer-spike (admin only).
 *
 * SEM persistência ainda (Fase 2). Só layout + fórmulas + proteção soft de subtotais.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { compareHierarchicalCodes } from "@/lib/utils";
import { buildCategoryLookup, type CategoryLookup } from "@/lib/category-hierarchy";

import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";

const EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA 2026

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
  /** For entry rows: original data. */
  entry?: Entry;
  /** For subtotal rows: 1-based row numbers of *direct children* (used to SUM). */
  childRows?: number[];
  /** Indent level 0..4 on Rubrica column. */
  indent: number;
}

export default function BPUniverSpike() {
  const { role } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);
  const univerRef = useRef<any>(null);
  const protectedCellsRef = useRef<Set<string>>(new Set()); // "r,c"
  const originalFormulasRef = useRef<Map<string, string>>(new Map()); // "r,c" -> formula
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
          supabase.from("account_categories").select("id, name, code, parent_id"),
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

  const built = useMemo(() => {
    if (!entries.length || !categories.length) return null;
    const lookup: Record<string, CategoryLookup> = buildCategoryLookup(categories as any);

    // Group entries by L1 > L2 > L3
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

    // Build ordered row list. Row 0 = header, Row 1 = DESPESAS (grand total).
    const rows: BuiltRow[] = [];
    rows.push({ kind: "header", label: "", indent: 0 });
    const grandRowIdx = rows.length; // 1
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

          // sort entries by description for stability
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
    const header = ["Rubrica", "Especificação", "Valor s/IVA", "IVA %", "Total c/IVA", "Formalidade"];
    const cellData: Record<number, Record<number, any>> = {};
    const rowData: Record<number, any> = {};
    const protectedCells = new Set<string>();
    const originalFormulas = new Map<string, string>();

    // Excel-like col letters for our columns: A=Rubrica, B=Especificação, C=Valor, D=IVA, E=Total, F=Formalidade
    const colLetter = (c: number) => String.fromCharCode(65 + c);
    const rref = (r: number, c: number) => `${colLetter(c)}${r + 1}`;
    const markProtected = (r: number, c: number) => protectedCells.add(`${r},${c}`);

    // Header
    cellData[0] = {};
    header.forEach((h, c) => {
      cellData[0][c] = { v: h, s: "sHeader" };
      markProtected(0, c);
    });
    rowData[0] = { h: 28 };

    built.forEach((row, r) => {
      if (r === 0) return; // header handled
      cellData[r] = {};
      const styleByKind: Record<RowKind, string> = {
        header: "sHeader",
        grand: "sGrand",
        l1: "sL1",
        l2: "sL2",
        l3: "sL3",
        entry: "sEntry",
      };
      const styleRubric: Record<RowKind, string> = {
        header: "sHeader",
        grand: "sGrandLabel",
        l1: "sL1Label",
        l2: "sL2Label",
        l3: "sL3Label",
        entry: "sEntryLabel",
      };
      const st = styleByKind[row.kind];
      const stLabel = styleRubric[row.kind];

      if (row.kind === "entry") {
        const e = row.entry!;
        cellData[r][0] = { v: e.description ?? "(sem descrição)", s: stLabel };
        cellData[r][1] = { v: e.specification ?? "", s: st };
        cellData[r][2] = { v: e.amount, s: "sMoney" };
        cellData[r][3] = { v: e.iva_rate, s: "sIva" };
        const totalFormula = `=C${r + 1}*(1+D${r + 1}/100)`;
        cellData[r][4] = { f: totalFormula, s: "sMoneyCalc" };
        cellData[r][5] = { v: e.formalidade ?? "", s: st };
        // Only Total c/IVA is protected (calculated); others editable
        markProtected(r, 4);
        originalFormulas.set(`${r},4`, totalFormula);
      } else {
        // Subtotal / grand total row
        cellData[r][0] = { v: row.label, s: stLabel };
        cellData[r][1] = { v: "", s: st };
        // SUM of children on col C (2) and col E (4). Children are non-contiguous
        // sibling subtotal rows OR entry rows — either way each addend is one row.
        const childRefs = (row.childRows ?? []).map((cr) => cr + 1); // 1-based
        const sumC = childRefs.length ? `=` + childRefs.map((rr) => `C${rr}`).join("+") : `=0`;
        const sumE = childRefs.length ? `=` + childRefs.map((rr) => `E${rr}`).join("+") : `=0`;
        cellData[r][2] = { f: sumC, s: row.kind === "grand" ? "sMoneyGrand" : row.kind === "l1" ? "sMoneyL1" : row.kind === "l2" ? "sMoneyL2" : "sMoneyL3" };
        cellData[r][3] = { v: "", s: st };
        cellData[r][4] = { f: sumE, s: row.kind === "grand" ? "sMoneyGrand" : row.kind === "l1" ? "sMoneyL1" : row.kind === "l2" ? "sMoneyL2" : "sMoneyL3" };
        cellData[r][5] = { v: "", s: st };
        // Whole subtotal row is protected
        for (let c = 0; c < 6; c++) markProtected(r, c);
        originalFormulas.set(`${r},2`, sumC);
        originalFormulas.set(`${r},4`, sumE);
      }
    });

    protectedCellsRef.current = protectedCells;
    originalFormulasRef.current = originalFormulas;

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
        // GRAND
        sGrand: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" } },
        sGrandLabel: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" }, pd: { l: 4 } },
        sMoneyGrand: { bl: 1, bg: { rgb: "#0f172a" }, cl: { rgb: "#ffffff" }, n: { pattern: "#,##0.00 [$€-816]" } },
        // L1
        sL1: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" } },
        sL1Label: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" }, pd: { l: 12 } },
        sMoneyL1: { bl: 1, bg: { rgb: "#cbd5e1" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        // L2
        sL2: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" } },
        sL2Label: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" }, pd: { l: 24 } },
        sMoneyL2: { bl: 1, bg: { rgb: "#e2e8f0" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        // L3
        sL3: { bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" } },
        sL3Label: { bl: 1, bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" }, pd: { l: 36 } },
        sMoneyL3: { bl: 1, bg: { rgb: "#f1f5f9" }, cl: { rgb: "#0f172a" }, n: { pattern: "#,##0.00 [$€-816]" } },
        // Entry
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
          columnCount: 6,
          freeze: { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 },
          columnData: {
            0: { w: 360 },
            1: { w: 240 },
            2: { w: 130 },
            3: { w: 70 },
            4: { w: 140 },
            5: { w: 130 },
          },
          rowData,
          cellData,
        },
      },
    };
  }, [built]);

  // Instantiate Univer once when container + data ready
  useEffect(() => {
    if (!containerRef.current || !workbookData || univerRef.current) return;
    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: merge({}, sheetsCoreEnUS) },
        presets: [UniverSheetsCorePreset({ container: containerRef.current })],
      });
      univerRef.current = univer;
      apiRef.current = univerAPI;
      univerAPI.createWorkbook(workbookData);

      // Soft protection: intercept edits and revert changes on protected cells.
      // Try modern event API first, fall back to command listener.
      try {
        const wb = univerAPI.getActiveWorkbook?.();
        const Event = (univerAPI as any).Event;
        if (Event && (univerAPI as any).addEvent) {
          (univerAPI as any).addEvent(Event.SheetEditEnded, (params: any) => {
            const { row, column } = params ?? {};
            if (row == null || column == null) return;
            const key = `${row},${column}`;
            if (!protectedCellsRef.current.has(key)) return;
            // Revert
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
    alert(`Estado impresso na consola. ${built?.length ?? 0} linhas montadas · ${protectedCellsRef.current.size} células protegidas.`);
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const entryCount = built?.filter((r) => r.kind === "entry").length ?? 0;
  const subtotalCount = built?.filter((r) => r.kind !== "entry" && r.kind !== "header").length ?? 0;

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">BP Univer Spike — Fase 1 (layout hierárquico)</h1>
        <p className="text-sm text-muted-foreground">
          Evento Anitta EDA 2026 · Despesas aprovadas · Hierarquia L1&gt;L2&gt;L3&gt;lançamentos
          com subtotais SUM ao vivo. Subtotais são read-only (edição revertida).
          Sem persistência (Fase 2).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={dumpState} disabled={!ready}>Ver alterações (consola)</Button>
        <span className="text-xs text-muted-foreground">
          {loading ? "A carregar BP…" : `${entryCount} lançamentos · ${subtotalCount} subtotais`}
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
        <summary className="cursor-pointer">Notas do spike (Fase 1)</summary>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Hierarquia construída via <code>buildCategoryLookup</code> (mesma helper que o export).</li>
          <li>Subtotais L1/L2/L3 + DESPESAS: fórmulas <code>=C_x+C_y+…</code> sobre linhas filhas diretas (não contíguas).</li>
          <li>Entrada: <code>Total c/IVA = C*(1+D/100)</code> → recalcula em cascata através das SUMs.</li>
          <li>Proteção: células marcadas em <code>protectedCellsRef</code>; listener <code>SheetEditEnded</code> reverte edições.</li>
          <li>Formatação por nível: cores hsl-neutrais aproximadas ao Excel exportado.</li>
        </ul>
      </details>
    </div>
  );
}
