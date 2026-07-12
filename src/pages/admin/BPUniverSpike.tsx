/**
 * BP Univer Spike — Isolated spike page.
 * ⚠️ DO NOT import from production code. Route: /admin/bp-univer-spike (admin only).
 *
 * Tests Univer (https://univer.ai) as an Excel-like editor for the BP.
 * Loads Anitta EDA 2026 expense forecasts (~154 rows), read+edit in memory.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { compareHierarchicalCodes } from "@/lib/utils";

// Univer presets (recommended entry-point)
import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";

const EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA 2026

interface Row {
  id: string;
  code: string;
  cat_name: string;
  description: string | null;
  specification: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string | null;
}

export default function BPUniverSpike() {
  const { role } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);
  const univerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const isAdmin = role === "admin" || role === "platform_admin";

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("event_forecasts")
          .select("id, description, specification, amount, iva_rate, formalidade, account_categories:category_id(code, name)")
          .eq("event_id", EVENT_ID)
          .is("version_id", null)
          .eq("status", "approved")
          .eq("type", "expense");
        if (error) throw error;
        const mapped: Row[] = (data ?? []).map((r: any) => ({
          id: r.id,
          code: r.account_categories?.code ?? "",
          cat_name: r.account_categories?.name ?? "",
          description: r.description,
          specification: r.specification,
          amount: Number(r.amount) || 0,
          iva_rate: Number(r.iva_rate) || 0,
          formalidade: r.formalidade,
        }));
        mapped.sort((a, b) => compareHierarchicalCodes(a.code, b.code));
        setRows(mapped);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build the workbook data
  const workbookData = useMemo(() => {
    if (!rows.length) return null;
    const header = ["Categoria", "Descrição", "Especificação", "Valor s/IVA", "IVA %", "Total c/IVA", "Formalidade"];
    const cellData: Record<number, Record<number, any>> = {};
    // header row
    cellData[0] = {};
    header.forEach((h, c) => {
      cellData[0][c] = { v: h, s: "header" };
    });
    rows.forEach((r, idx) => {
      const rowIdx = idx + 1;
      cellData[rowIdx] = {
        0: { v: `${r.code} ${r.cat_name}` },
        1: { v: r.description ?? "" },
        2: { v: r.specification ?? "" },
        3: { v: r.amount, s: "money" },
        4: { v: r.iva_rate },
        5: { f: `=D${rowIdx + 1}*(1+E${rowIdx + 1}/100)`, s: "money" },
        6: { v: r.formalidade ?? "" },
      };
    });
    return {
      id: "bp-univer-spike",
      name: "BP Anitta EDA 2026",
      appVersion: "0.25.1",
      locale: LocaleType.EN_US,
      styles: {
        header: {
          bl: 1, // bold
          bg: { rgb: "#1e293b" },
          cl: { rgb: "#ffffff" },
          ht: 2, // center
        },
        money: {
          n: { pattern: "#,##0.00 [$€-816]" },
        },
      },
      sheetOrder: ["sheet1"],
      sheets: {
        sheet1: {
          id: "sheet1",
          name: "BP",
          rowCount: rows.length + 5,
          columnCount: 7,
          freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
          columnData: {
            0: { w: 220 },
            1: { w: 260 },
            2: { w: 180 },
            3: { w: 120 },
            4: { w: 70 },
            5: { w: 130 },
            6: { w: 120 },
          },
          cellData,
        },
      },
    };
  }, [rows]);

  // Instantiate Univer once when container + data ready
  useEffect(() => {
    if (!containerRef.current || !workbookData || univerRef.current) return;
    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: merge({}, sheetsCoreEnUS),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      });
      univerRef.current = univer;
      apiRef.current = univerAPI;
      univerAPI.createWorkbook(workbookData);
      setReady(true);
    } catch (e: any) {
      setErr("Falha a inicializar Univer: " + (e?.message ?? String(e)));
    }
    return () => {
      try {
        univerRef.current?.dispose?.();
      } catch {}
      univerRef.current = null;
      apiRef.current = null;
    };
  }, [workbookData]);

  const dumpState = () => {
    const api = apiRef.current;
    if (!api) return;
    const wb = api.getActiveWorkbook?.();
    const sheet = wb?.getActiveSheet?.();
    const snapshot = wb?.getSnapshot?.();
    // Extract rows back
    const readBack: any[] = [];
    if (sheet) {
      const maxRow = rows.length; // 1..N
      for (let r = 1; r <= maxRow; r++) {
        const range = sheet.getRange(r, 0, 1, 7);
        const values = range.getValues?.();
        const flat = values?.[0]?.map((c: any) => c?.v ?? c?.f ?? null) ?? [];
        readBack.push(flat);
      }
    }
    // eslint-disable-next-line no-console
    console.log("[BPUniverSpike] snapshot:", snapshot);
    // eslint-disable-next-line no-console
    console.log("[BPUniverSpike] read-back rows:", readBack);
    alert(`Estado impresso na consola. Snapshot com ${Object.keys(snapshot?.sheets ?? {}).length} folha(s); ${readBack.length} linhas lidas de volta.`);
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">BP Univer Spike</h1>
        <p className="text-sm text-muted-foreground">
          Spike isolado — teste do Univer como grelha estilo Excel. Evento Anitta EDA 2026.
          Sem persistência. Editar em memória; usar botão para inspeccionar estado na consola.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={dumpState} disabled={!ready}>Ver alterações (consola)</Button>
        <span className="text-xs text-muted-foreground">
          {loading ? "A carregar BP…" : `${rows.length} linhas carregadas`}
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
        style={{ width: "100%", height: "75vh", border: "1px solid hsl(var(--border))" }}
      />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Notas do spike</summary>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Univer versão 0.25.1 (@univerjs/presets + @univerjs/preset-sheets-core).</li>
          <li>Coluna F usa fórmula <code>=D*(1+E/100)</code> — testa motor de fórmulas.</li>
          <li>Cabeçalho congelado, formato moeda EUR, larguras customizadas.</li>
          <li>Testar: setas ←↑→↓, Tab/Enter, F2, copy/paste do Excel, seleção Shift+setas.</li>
        </ul>
      </details>
    </div>
  );
}
