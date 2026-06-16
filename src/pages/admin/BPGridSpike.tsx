/**
 * SPIKE F0 — react-datasheet-grid POC
 *
 * Goal: validar viabilidade de substituir BPGridEditor por uma grelha
 * Excel-like (react-datasheet-grid). NÃO persiste, só estado local.
 *
 * Ponto crítico testado: SearchableSelect dentro de uma célula.
 *
 * Route: /admin/bp-grid-spike (admin/platform_admin only).
 * Hardcoded event: Anitta EDA fdfb39fe-45f2-43f5-9ec9-7cb536360ae1.
 */
import * as React from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  type Column,
} from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { compareHierarchicalCodes } from "@/lib/utils";

// ---- Constants ----
const EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA
const EUR_FMT = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const IVA_OPTIONS = [0, 6, 13, 23];
const FORMALIDADE_OPTIONS = [
  { value: "estimado", label: "Estimado" },
  { value: "negociacao", label: "Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "pago_parcial", label: "Pago parcial" },
  { value: "pago_total", label: "Pago total" },
];

// ---- Row type ----
interface Row {
  id: string;
  category_id: string | null;
  description: string;
  amount: number;
  iva_rate: number;
  formalidade: string;
  notes: string;
}

// ============================================================
// Custom cell: SearchableSelect (THE critical test)
// ============================================================
function CategoryCellComponent({
  rowData,
  setRowData,
  focus,
  stopEditing,
  options,
}: {
  rowData: string | null;
  setRowData: (v: string | null) => void;
  focus: boolean;
  stopEditing: (opts?: { nextRow?: boolean }) => void;
  options: { value: string; label: string }[];
}) {
  // Open the popover as soon as the cell enters edit mode
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (focus) setOpen(true);
  }, [focus]);

  return (
    <div
      className="w-full px-1"
      // Prevent the grid from intercepting keys while the popover handles search
      onKeyDown={(e) => {
        if (open) e.stopPropagation();
      }}
      onMouseDown={(e) => {
        // Avoid grid losing focus when interacting with the popover content
        e.stopPropagation();
      }}
    >
      <SearchableSelect
        value={rowData ?? ""}
        onValueChange={(v) => {
          setRowData(v || null);
          setOpen(false);
          stopEditing({ nextRow: false });
        }}
        options={options}
        placeholder="Selecionar L3…"
      />
    </div>
  );
}

function makeCategoryColumn(
  options: { value: string; label: string }[],
  labelById: Map<string, string>,
): Partial<Column<string | null, any, string>> {
  return {
    component: ({ rowData, setRowData, focus, stopEditing }) => (
      <CategoryCellComponent
        rowData={rowData as any}
        setRowData={setRowData as any}
        focus={focus}
        stopEditing={stopEditing}
        options={options}
      />
    ),
    deleteValue: () => null,
    copyValue: ({ rowData }) =>
      (rowData && labelById.get(rowData)) || "",
    pasteValue: ({ value }) => {
      // Best-effort: match by label
      const found = options.find(
        (o) => o.label.toLowerCase() === String(value).toLowerCase(),
      );
      return found ? found.value : null;
    },
  };
}

// ============================================================
// Custom cell: Currency EUR
// ============================================================
function CurrencyCellComponent({
  rowData,
  setRowData,
  focus,
}: {
  rowData: number;
  setRowData: (v: number) => void;
  focus: boolean;
}) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (focus) {
      setDraft(rowData ? String(rowData).replace(".", ",") : "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [focus, rowData]);

  if (!focus) {
    return (
      <div className="w-full px-2 py-1 text-right font-mono tabular-nums">
        {EUR_FMT.format(rowData || 0)}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const cleaned = draft
          .replace(/[€\s]/g, "")
          .replace(/[^\d,.\-]/g, "")
          .replace(/\.(?=\d{3}(\D|$))/g, "")
          .replace(",", ".");
        const n = parseFloat(cleaned);
        setRowData(Number.isFinite(n) ? n : 0);
      }}
      className="w-full border-0 bg-transparent px-2 py-1 text-right font-mono tabular-nums outline-none"
    />
  );
}

const currencyColumn: Partial<Column<number, any, string>> = {
  component: ({ rowData, setRowData, focus }) => (
    <CurrencyCellComponent
      rowData={rowData as number}
      setRowData={setRowData as any}
      focus={focus}
    />
  ),
  deleteValue: () => 0,
  copyValue: ({ rowData }) => String(rowData ?? 0).replace(".", ","),
  pasteValue: ({ value }) => {
    const cleaned = String(value)
      .replace(/[€\s]/g, "")
      .replace(/[^\d,.\-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  },
};

// ============================================================
// Custom cell: native <select> (IVA + Formalidade)
// ============================================================
function SelectCellComponent({
  rowData,
  setRowData,
  focus,
  options,
  format,
}: {
  rowData: any;
  setRowData: (v: any) => void;
  focus: boolean;
  options: { value: any; label: string }[];
  format?: (v: any) => string;
}) {
  if (!focus) {
    return (
      <div className="w-full px-2 py-1 text-right tabular-nums">
        {format ? format(rowData) : (options.find((o) => o.value === rowData)?.label ?? "")}
      </div>
    );
  }
  return (
    <select
      autoFocus
      value={rowData}
      onChange={(e) => {
        const v = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
        setRowData(v);
      }}
      className="w-full border-0 bg-transparent px-2 py-1 outline-none"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function makeSelectColumn(
  options: { value: any; label: string }[],
  format?: (v: any) => string,
): Partial<Column<any, any, string>> {
  return {
    component: ({ rowData, setRowData, focus }) => (
      <SelectCellComponent
        rowData={rowData}
        setRowData={setRowData as any}
        focus={focus}
        options={options}
        format={format}
      />
    ),
    copyValue: ({ rowData }) => String(rowData ?? ""),
    pasteValue: ({ value }) => {
      const trimmed = String(value).trim();
      const found = options.find(
        (o) => String(o.value) === trimmed || o.label.toLowerCase() === trimmed.toLowerCase(),
      );
      return found ? found.value : options[0]?.value;
    },
  };
}

// ============================================================
// Page
// ============================================================
export default function BPGridSpike() {
  const { role } = useAuth();
  const isAuthorized = role === "admin" || (role as any) === "platform_admin";

  // Forecasts
  const { data: forecasts = [], isLoading: lForecasts } = useQuery({
    queryKey: ["spike_forecasts", EVENT_ID],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select(
          "id, category_id, description, amount, iva_rate, formalidade, notes, type, is_overhead, exclude_from_result, master_forecast_id, is_retroactive_override",
        )
        .eq("event_id", EVENT_ID)
        .eq("type", "expense");
      if (error) throw error;
      // Filter out non-editable rows for the spike
      return (data ?? []).filter(
        (r: any) =>
          !r.is_overhead &&
          !r.exclude_from_result &&
          !r.master_forecast_id &&
          !r.is_retroactive_override,
      );
    },
  });

  // Categories
  const { data: categories = [], isLoading: lCats } = useQuery({
    queryKey: ["spike_categories"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, code, name, type, parent_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  // L3 expense options sorted by code
  const { catOptions, labelById } = React.useMemo(() => {
    const childOf = new Set(categories.map((c: any) => c.parent_id).filter(Boolean));
    const l3 = categories.filter(
      (c: any) => c.type === "expense" && !childOf.has(c.id),
    );
    l3.sort((a: any, b: any) => compareHierarchicalCodes(a.code, b.code));
    const opts = l3.map((c: any) => ({
      value: c.id,
      label: `${c.code} · ${c.name}`,
    }));
    const map = new Map<string, string>();
    for (const o of opts) map.set(o.value, o.label);
    return { catOptions: opts, labelById: map };
  }, [categories]);

  // Local rows state (no persist — spike only)
  const [rows, setRows] = React.useState<Row[]>([]);
  React.useEffect(() => {
    if (!forecasts.length) return;
    setRows(
      forecasts.map((f: any) => ({
        id: f.id,
        category_id: f.category_id,
        description: f.description ?? "",
        amount: Number(f.amount ?? 0),
        iva_rate: Number(f.iva_rate ?? 23),
        formalidade: f.formalidade ?? "estimado",
        notes: f.notes ?? "",
      })),
    );
  }, [forecasts]);

  const columns: Column<Row, any, any>[] = React.useMemo(
    () => [
      {
        ...keyColumn<Row, "category_id">("category_id", makeCategoryColumn(catOptions, labelById) as any),
        title: "Categoria L3",
        minWidth: 280,
      },
      {
        ...keyColumn<Row, "description">("description", textColumn),
        title: "Descrição",
        minWidth: 240,
      },
      {
        ...keyColumn<Row, "amount">("amount", currencyColumn as any),
        title: "Valor",
        minWidth: 120,
      },
      {
        ...keyColumn<Row, "iva_rate">(
          "iva_rate",
          makeSelectColumn(
            IVA_OPTIONS.map((v) => ({ value: v, label: `${v}%` })),
            (v) => `${v}%`,
          ) as any,
        ),
        title: "IVA",
        minWidth: 70,
      },
      {
        ...keyColumn<Row, "formalidade">(
          "formalidade",
          makeSelectColumn(FORMALIDADE_OPTIONS) as any,
        ),
        title: "Formalidade",
        minWidth: 130,
      },
      {
        ...keyColumn<Row, "notes">("notes", textColumn),
        title: "Notas",
        minWidth: 200,
      },
    ],
    [catOptions, labelById],
  );

  if (!isAuthorized) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">BP Grid Spike — react-datasheet-grid</h1>
        <p className="text-sm text-muted-foreground">
          POC isolada. Evento: Anitta EDA. NÃO persiste — só estado local.
          Para testar: navegação por setas, Enter/Tab, edit-on-type, paste TSV
          do Excel, e o dropdown pesquisável de Categoria.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Linhas: {rows.length}</Badge>
        <Badge variant="outline">Categorias L3 (expense): {catOptions.length}</Badge>
        {(lForecasts || lCats) && <Badge>A carregar…</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grelha</CardTitle>
        </CardHeader>
        <CardContent>
          <DataSheetGrid<Row>
            value={rows}
            onChange={setRows}
            columns={columns}
            height={600}
            rowKey="id"
            lockRows
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist do spike</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>↑↓←→ navegam entre células</li>
            <li>Enter desce, Tab avança, Shift+Tab volta</li>
            <li>Começar a escrever entra em edição substituindo a célula</li>
            <li>Shift+setas seleciona um range</li>
            <li>Cmd/Ctrl+C copia, Cmd/Ctrl+V cola TSV do Excel</li>
            <li><strong>Categoria L3</strong>: clique abre o dropdown pesquisável; escrever filtra; Enter selecciona</li>
            <li>Valor: formata 1.234,56 € quando não focado; edita em modo cru</li>
            <li>IVA / Formalidade: select nativo</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
