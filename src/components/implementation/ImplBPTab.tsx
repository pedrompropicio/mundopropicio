import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { X, Pencil, Save, AlertTriangle, CheckCircle2, FileSearch, Loader2, ArrowRight, Eye, GitMerge } from "lucide-react";
import { parseXlsxPL, type ParsedRow, type ParsedSheet } from "@/lib/import-pl-xlsx";
import { createExpenseCategoryMatcher } from "@/lib/pl-category-matching";
import * as XLSX from "xlsx";

interface Props {
  implementation: any;
  event: any;
  allEvents: any[];
  eventDates?: any[];
  eventSessions?: any[];
}

interface MatchedLine {
  idx: number;
  source: ParsedRow;
  match: any | null; // forecast from DB
  matchScore: number;
  divergences: string[];
  suggestedCategoryId: string | null;
}

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function matchScore(source: ParsedRow, forecast: any): { score: number; divergences: string[] } {
  let score = 0;
  const divergences: string[] = [];
  const descMatch = norm(source.description) === norm(forecast.description);
  if (descMatch) score += 50;
  else if (norm(forecast.description).includes(norm(source.description)) || norm(source.description).includes(norm(forecast.description))) score += 30;

  const amountDiff = Math.abs(source.baseAmount - Number(forecast.amount));
  if (amountDiff < 0.01) score += 30;
  else if (amountDiff < 1) score += 15;
  else divergences.push(`Valor: ${source.baseAmount.toFixed(2)}€ vs ${Number(forecast.amount).toFixed(2)}€`);

  if (source.ivaRate === Number(forecast.iva_rate)) score += 10;
  else divergences.push(`IVA: ${source.ivaRate}% vs ${forecast.iva_rate}%`);

  if (!descMatch) divergences.push(`Descrição: "${source.description}" vs "${forecast.description}"`);

  return { score, divergences };
}

// Auto-match a sheet name to an event or date
function autoMatchSheet(sheetName: string, events: any[], dates: any[]): { type: "event" | "date" | "none"; id: string } {
  const sn = norm(sheetName);
  // Try matching event names
  for (const e of events) {
    const en = norm(e.name);
    if (sn === en || en.includes(sn) || sn.includes(en)) return { type: "event", id: e.id };
    // Try city names from event name (e.g. "Lisboa" in "Artista - Lisboa")
    const parts = e.name.split(/[-–—]/);
    for (const p of parts) {
      if (norm(p).length > 2 && sn.includes(norm(p))) return { type: "event", id: e.id };
    }
  }
  // Try matching dates
  for (const d of dates) {
    const dateStr = new Date(d.date).toLocaleDateString("pt-PT");
    const dateShort = dateStr.replace(/\//g, "-");
    if (sn.includes(dateStr) || sn.includes(dateShort) || sn.includes(d.date)) return { type: "date", id: d.id };
    if (d.label && norm(d.label).length > 2 && sn.includes(norm(d.label))) return { type: "date", id: d.id };
  }
  return { type: "none", id: "" };
}

interface SheetMapping {
  sheetName: string;
  targetType: "event" | "date" | "ignore";
  targetId: string;
  autoMatched: boolean;
}

interface ApportionmentSuggestion {
  description: string;
  normalizedKey: string;
  sheets: string[];
  rowsBySheet: Record<string, number>;
  avgAmount: number;
  avgIvaRate: number;
  promoteToMaster: boolean;
  /** Editable category ID for the consolidated Master line */
  categoryId: string;
}

export function ImplBPTab({ implementation, event, allEvents, eventDates = [], eventSessions = [] }: Props) {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>(event?.id || "");
  const [selectedDateId, setSelectedDateId] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [viewMode, setViewMode] = useState<"comparison" | "app" | "raw">("app");
  const [sheetMappings, setSheetMappings] = useState<SheetMapping[] | null>(null);
  const [showMappingStep, setShowMappingStep] = useState(false);
  const [rawSheetData, setRawSheetData] = useState<Record<string, any[][]>>({});
  const [expandedRawRow, setExpandedRawRow] = useState<number | null>(null);
  const [editingSourceIdx, setEditingSourceIdx] = useState<number | null>(null);
  const [editSourceValues, setEditSourceValues] = useState<{ description: string; specification: string; baseAmount: string; ivaRate: string }>({ description: "", specification: "", baseAmount: "0", ivaRate: "0" });
  const [showApportionmentStep, setShowApportionmentStep] = useState(false);
  const [apportionmentSuggestions, setApportionmentSuggestions] = useState<ApportionmentSuggestion[]>([]);
  const [masterSheetRows, setMasterSheetRows] = useState<ParsedRow[]>([]);

  // Event dates for selected event
  const datesForEvent = eventDates.filter((d: any) => d.event_id === selectedEventId);
  const sessionsForEvent = eventSessions.filter((s: any) => s.event_id === selectedEventId);

  // Fetch forecasts for the selected event
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["impl-forecasts", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories:category_id(id, name, code)")
        .eq("event_id", selectedEventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["impl-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const leafCategories = categories.filter(
    (c) => !categories.some((other) => other.parent_id === c.id)
  );

  // Parse reference file
  const handleParseFile = useCallback(async () => {
    if (!implementation.reference_file_url) {
      toast.error("Nenhum ficheiro de referência anexado");
      return;
    }
    setParsing(true);
    try {
      const { data: signedData, error: signErr } = await supabase.storage
        .from("implementation-files")
        .createSignedUrl(implementation.reference_file_url, 3600);
      if (signErr || !signedData?.signedUrl) throw new Error("Erro ao aceder ficheiro");

      const response = await fetch(signedData.signedUrl);
      const buffer = await response.arrayBuffer();

      const fileName = implementation.reference_file_name || "";
      if (fileName.toLowerCase().endsWith(".pdf")) {
        toast.error("Análise de PDF ainda não suportada — utilize ficheiros XLSX");
        setParsing(false);
        return;
      }

      // Store raw Excel data for preview
      const wb = XLSX.read(buffer, { type: "array" });
      const rawData: Record<string, any[][]> = {};
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        rawData[sn] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
      }
      setRawSheetData(rawData);

      const sheets = parseXlsxPL(buffer);
      setParsedSheets(sheets);

      // Build auto-mappings if multiple sheets
      if (sheets.length > 1) {
        const mappings: SheetMapping[] = sheets.map(s => {
          const match = autoMatchSheet(s.sheetName, allEvents, eventDates);
          return {
            sheetName: s.sheetName,
            targetType: match.type === "none" ? "ignore" : (match.type as "event" | "date"),
            targetId: match.id,
            autoMatched: match.type !== "none",
          };
        });
        setSheetMappings(mappings);
        setShowMappingStep(true);
      } else if (sheets.length === 1) {
        setSelectedSheet(sheets[0].sheetName);
        setViewMode("comparison");
      }
      toast.success(`Ficheiro analisado: ${sheets.length} aba(s), ${sheets.reduce((s, sh) => s + sh.rows.length, 0)} linhas`);
    } catch (err: any) {
      toast.error("Erro ao analisar ficheiro: " + err.message);
    } finally {
      setParsing(false);
    }
  }, [implementation]);
  // String similarity (Dice coefficient) for description matching
  const stringSimilarity = (a: string, b: string): number => {
    const na = norm(a);
    const nb = norm(b);
    if (na === nb) return 1;
    if (na.length < 2 || nb.length < 2) return 0;
    const bigrams = (s: string) => {
      const set: Record<string, number> = {};
      for (let i = 0; i < s.length - 1; i++) {
        const bi = s.substring(i, i + 2);
        set[bi] = (set[bi] || 0) + 1;
      }
      return set;
    };
    const bg1 = bigrams(na);
    const bg2 = bigrams(nb);
    let intersection = 0;
    for (const bi in bg1) {
      if (bg2[bi]) intersection += Math.min(bg1[bi], bg2[bi]);
    }
    return (2 * intersection) / (na.length - 1 + nb.length - 1);
  };

  // Analyze apportionment: find rows that appear in ALL active sheets with strict criteria
  const analyzeApportionment = useCallback(() => {
    if (!parsedSheets || !sheetMappings) return;
    const activeSheets = sheetMappings.filter(m => m.targetType !== "ignore");
    if (activeSheets.length < 2) {
      setShowApportionmentStep(false);
      return;
    }

    // Build row lists per sheet with category info
    type SheetRow = { row: ParsedRow; idx: number; sheetName: string; ivaRate: number };
    const sheetRows: Record<string, SheetRow[]> = {};
    for (const mapping of activeSheets) {
      const sheet = parsedSheets.find(s => s.sheetName === mapping.sheetName);
      if (!sheet) continue;
      sheetRows[mapping.sheetName] = sheet.rows.map((row, idx) => ({
        row, idx, sheetName: mapping.sheetName, ivaRate: row.ivaRate,
      }));
    }

    const sheetNames = activeSheets.map(m => m.sheetName);
    const firstSheetName = sheetNames[0];
    const otherSheetNames = sheetNames.slice(1);

    const suggestions: ApportionmentSuggestion[] = [];
    const usedInOtherSheets: Record<string, Set<number>> = {};
    otherSheetNames.forEach(sn => { usedInOtherSheets[sn] = new Set(); });

    // For each row in the first sheet, try to find a matching row in ALL other sheets
    for (const candidate of (sheetRows[firstSheetName] || [])) {
      const matches: Record<string, number> = { [firstSheetName]: candidate.idx };
      let allMatch = true;

      for (const otherSheet of otherSheetNames) {
        const rows = sheetRows[otherSheet] || [];
        let bestIdx = -1;
        let bestSim = 0;

        for (const other of rows) {
          if (usedInOtherSheets[otherSheet].has(other.idx)) continue;

          // Criterion 1: Exact same base amount
          if (Math.abs(candidate.row.baseAmount - other.row.baseAmount) > 0.01) continue;

          // Criterion 2: Same IVA rate (proxy for same category)
          if (candidate.row.ivaRate !== other.row.ivaRate) continue;

          // Criterion 3: Description similarity >= 80%
          const sim = stringSimilarity(candidate.row.description, other.row.description);
          if (sim < 0.8) continue;

          if (sim > bestSim) { bestSim = sim; bestIdx = other.idx; }
        }

        if (bestIdx >= 0) {
          matches[otherSheet] = bestIdx;
        } else {
          allMatch = false;
          break;
        }
      }

      // Only suggest if found in ALL active sheets
      if (allMatch) {
        otherSheetNames.forEach(sn => { usedInOtherSheets[sn].add(matches[sn]); });
        // Auto-suggest category using matcher
        const matcher = createExpenseCategoryMatcher(categories as any);
        const suggestedCategoryId = matcher({ description: candidate.row.description, specification: candidate.row.specification }) || "";
        suggestions.push({
          description: candidate.row.description,
          normalizedKey: norm(candidate.row.description),
          sheets: sheetNames,
          rowsBySheet: matches,
          avgAmount: candidate.row.baseAmount,
          avgIvaRate: candidate.row.ivaRate,
          promoteToMaster: true,
          categoryId: suggestedCategoryId,
        });
      }
    }

    setApportionmentSuggestions(suggestions);
    setShowApportionmentStep(suggestions.length > 0);

    if (suggestions.length === 0) {
      toast.info("Nenhum custo idêntico em todas as cidades encontrado");
    }
  }, [parsedSheets, sheetMappings]);

  // Apply apportionment: mark promoted rows, keep them in sheets but track as rateio
  const applyApportionment = useCallback(() => {
    if (!parsedSheets || !sheetMappings) return;
    const promoted = apportionmentSuggestions.filter(s => s.promoteToMaster);
    if (promoted.length === 0) {
      setShowApportionmentStep(false);
      return;
    }

    const masterRows: ParsedRow[] = [];

    // Collect one representative row per promoted item (use first sheet's row)
    for (const suggestion of promoted) {
      const firstSheet = suggestion.sheets[0];
      const sheet = parsedSheets.find(s => s.sheetName === firstSheet);
      if (!sheet) continue;
      const rowIdx = suggestion.rowsBySheet[firstSheet];
      if (rowIdx !== undefined && sheet.rows[rowIdx]) {
        masterRows.push({ ...sheet.rows[rowIdx] });
      }
    }

    // Do NOT remove rows from sheets — they stay visible but marked as rateio
    setMasterSheetRows(masterRows);
    setShowApportionmentStep(false);

    toast.success(`${promoted.length} custo(s) marcado(s) como rateio para o Master`);
  }, [parsedSheets, sheetMappings, apportionmentSuggestions]);


  // Category matcher for source rows
  const categoryMatcher = useMemo(() => {
    if (categories.length === 0) return null;
    return createExpenseCategoryMatcher(categories as any);
  }, [categories]);

  // Override categories for source rows (keyed by sheet:idx)
  const [sourceCategoryOverrides, setSourceCategoryOverrides] = useState<Record<string, string>>({});

  const matchedLines = useMemo((): MatchedLine[] => {
    if (!parsedSheets || !selectedSheet) return [];
    const sheet = parsedSheets.find((s) => s.sheetName === selectedSheet);
    if (!sheet) return [];

    const usedForecastIds = new Set<string>();
    const lines: MatchedLine[] = [];

    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      let bestMatch: any = null;
      let bestScore = 0;
      let bestDivergences: string[] = [];

      for (const f of forecasts) {
        if (usedForecastIds.has(f.id)) continue;
        const { score, divergences } = matchScore(row, f);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = f;
          bestDivergences = divergences;
        }
      }

      if (bestMatch && bestScore >= 30) {
        usedForecastIds.add(bestMatch.id);
      } else {
        bestMatch = null;
        bestDivergences = ["Sem correspondência no App"];
      }

      // Auto-suggest category for source row
      const suggestedCategoryId = categoryMatcher
        ? categoryMatcher({ description: row.description, specification: row.specification })
        : null;

      lines.push({ idx: i, source: row, match: bestMatch, matchScore: bestScore, divergences: bestDivergences, suggestedCategoryId });
    }

    // Add unmatched forecasts
    for (const f of forecasts) {
      if (!usedForecastIds.has(f.id)) {
        lines.push({
          idx: -1,
          source: { description: "", specification: null, baseAmount: 0, ivaAmount: 0, total: 0, ivaRate: 0, attachments: [], status: "paid" },
          match: f,
          matchScore: 0,
          divergences: ["Sem correspondência no ficheiro"],
          suggestedCategoryId: null,
        });
      }
    }

    return lines;
  }, [parsedSheets, selectedSheet, forecasts, categoryMatcher]);

  // Stats
  const totalMatched = matchedLines.filter((l) => l.match && l.idx >= 0).length;
  const totalDivergent = matchedLines.filter((l) => l.match && l.idx >= 0 && l.divergences.length > 0).length;
  const totalUnmatchedSource = matchedLines.filter((l) => !l.match && l.idx >= 0).length;
  const totalUnmatchedApp = matchedLines.filter((l) => l.idx < 0).length;

  // File totals for current sheet (interpreted)
  const currentSheet = parsedSheets?.find((s) => s.sheetName === selectedSheet);
  const fileTotalBase = currentSheet?.rows.reduce((s, r) => s + r.baseAmount, 0) ?? 0;
  const fileTotalIva = currentSheet?.rows.reduce((s, r) => s + r.ivaAmount, 0) ?? 0;
  const fileTotalGross = currentSheet?.rows.reduce((s, r) => s + r.total, 0) ?? 0;
  const fileLineCount = currentSheet?.rows.length ?? 0;

  // Original file total: extract from raw data "Total" row
  const originalFileTotal = useMemo(() => {
    if (!selectedSheet || !rawSheetData[selectedSheet]) return null;
    const raw = rawSheetData[selectedSheet];
    if (!raw || raw.length < 2) return null;

    // Find header row to locate the "total" column
    let headerIdx = -1;
    let totalColIdx = -1;
    let costColIdx = -1;
    for (let i = 0; i < Math.min(raw.length, 15); i++) {
      const row = raw[i].map((v: any) => norm(String(v || "")));
      const hasDesc = row.some((c: string) => c.includes("descri"));
      const hasCost = row.findIndex((c: string) => c.includes("custo") || c.includes("valor") || c.includes("base"));
      const hasTotal = row.findIndex((c: string) => c.includes("total"));
      if (hasDesc && (hasCost >= 0 || hasTotal >= 0)) {
        headerIdx = i;
        costColIdx = hasCost;
        totalColIdx = hasTotal >= 0 ? hasTotal : hasCost;
        break;
      }
    }
    if (headerIdx < 0 || totalColIdx < 0) return null;

    // Scan for rows starting with "total" (case insensitive) after header
    for (let i = raw.length - 1; i > headerIdx; i--) {
      const row = raw[i];
      const desc = norm(String(row[0] ?? row[1] ?? ""));
      // Check all cells in the row for "total" keyword
      const hasTotal = row.some((c: any, ci: number) => ci <= 2 && norm(String(c || "")).startsWith("total"));
      if (hasTotal) {
        // Try total column first, then cost column
        const valFromTotal = parseFloat(String(row[totalColIdx] ?? "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
        const valFromCost = costColIdx >= 0 ? parseFloat(String(row[costColIdx] ?? "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0 : 0;
        const val = valFromTotal || valFromCost;
        if (val > 0) return { total: val, costCol: valFromCost, totalCol: valFromTotal, rowIdx: i + 1 };
      }
    }
    return null;
  }, [selectedSheet, rawSheetData]);

  // Matched lines totals (file side and app side)
  const compFileTotal = matchedLines.filter(l => l.idx >= 0).reduce((s, l) => s + l.source.baseAmount, 0);
  const compFileTotalIva = matchedLines.filter(l => l.idx >= 0).reduce((s, l) => s + l.source.ivaAmount, 0);
  const compFileTotalGross = compFileTotal + compFileTotalIva;
  const compAppTotal = matchedLines.filter(l => l.match).reduce((s, l) => s + Number(l.match.amount), 0);
  const compAppTotalIva = matchedLines.filter(l => l.match).reduce((s, l) => s + Number(l.match.amount) * Number(l.match.iva_rate ?? 0) / 100, 0);
  const compAppTotalGross = compAppTotal + compAppTotalIva;

  // Set of normalized descriptions that were promoted to master (rateio)
  const rateioDescriptions = useMemo(() => {
    if (masterSheetRows.length === 0) return new Set<string>();
    return new Set(masterSheetRows.map(r => norm(r.description)));
  }, [masterSheetRows]);

  const updateForecast = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("event_forecasts").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-forecasts", selectedEventId] });
      toast.success("Previsão atualizada");
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteForecast = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-forecasts", selectedEventId] });
      toast.success("Previsão removida");
    },
  });

  // Apply source value to forecast
  const applySourceToForecast = useMutation({
    mutationFn: async ({ forecastId, source }: { forecastId: string; source: ParsedRow }) => {
      const { error } = await supabase.from("event_forecasts").update({
        description: source.description,
        specification: source.specification,
        amount: source.baseAmount,
        iva_rate: source.ivaRate,
      }).eq("id", forecastId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-forecasts", selectedEventId] });
      toast.success("Valores do ficheiro aplicados");
    },
  });

  const startEdit = (forecast: any) => {
    setEditingId(forecast.id);
    setEditValues({
      description: forecast.description,
      specification: forecast.specification || "",
      amount: forecast.amount,
      iva_rate: forecast.iva_rate,
      category_id: forecast.category_id || "",
      status: forecast.status,
      type: forecast.type,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateForecast.mutate({
      id: editingId,
      updates: {
        description: editValues.description,
        specification: editValues.specification || null,
        amount: Number(editValues.amount),
        iva_rate: Number(editValues.iva_rate),
        category_id: editValues.category_id || null,
        status: editValues.status,
        type: editValues.type,
      },
    });
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

  // --- Source row editing ---
  const startEditSource = (idx: number, row: ParsedRow) => {
    setEditingSourceIdx(idx);
    setEditSourceValues({
      description: row.description,
      specification: row.specification || "",
      baseAmount: String(row.baseAmount),
      ivaRate: String(row.ivaRate),
    });
  };

  const saveEditSource = () => {
    if (editingSourceIdx === null || !parsedSheets || !selectedSheet) return;
    const sheetIdx = parsedSheets.findIndex((s) => s.sheetName === selectedSheet);
    if (sheetIdx < 0) return;
    const updated = [...parsedSheets];
    const rows = [...updated[sheetIdx].rows];
    const base = Number(editSourceValues.baseAmount) || 0;
    const rate = Number(editSourceValues.ivaRate) || 0;
    const iva = Math.round(base * rate) / 100;
    rows[editingSourceIdx] = {
      ...rows[editingSourceIdx],
      description: editSourceValues.description,
      specification: editSourceValues.specification || null,
      baseAmount: Math.round(base * 100) / 100,
      ivaRate: rate,
      ivaAmount: Math.round(iva * 100) / 100,
      total: Math.round((base + iva) * 100) / 100,
    };
    updated[sheetIdx] = { ...updated[sheetIdx], rows };
    setParsedSheets(updated);
    setEditingSourceIdx(null);
  };

  const deleteSourceRow = (idx: number) => {
    if (!parsedSheets || !selectedSheet) return;
    const sheetIdx = parsedSheets.findIndex((s) => s.sheetName === selectedSheet);
    if (sheetIdx < 0) return;
    const updated = [...parsedSheets];
    const rows = [...updated[sheetIdx].rows];
    rows.splice(idx, 1);
    updated[sheetIdx] = { ...updated[sheetIdx], rows };
    setParsedSheets(updated);
    toast.success("Linha removida da interpretação");
  };

  const totalExpense = forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const totalIncome = forecasts.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      {/* Event selector + File analysis button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {allEvents.length > 1 && (
            <>
              <span className="text-sm font-medium text-muted-foreground">Evento:</span>
              <Select value={selectedEventId} onValueChange={(v) => { setSelectedEventId(v); setSelectedDateId("all"); }}>
                <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allEvents.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.parent_event_id ? "↳ " : "🎤 "}{e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {datesForEvent.length > 0 && (
            <>
              <span className="text-sm font-medium text-muted-foreground">Data:</span>
              <Select value={selectedDateId} onValueChange={setSelectedDateId}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as datas</SelectItem>
                  {datesForEvent.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {new Date(d.date).toLocaleDateString("pt-PT")} {d.label ? `— ${d.label}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {implementation.reference_file_url && (
            <Button variant="outline" onClick={handleParseFile} disabled={parsing}>
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSearch className="h-4 w-4 mr-2" />}
              {parsedSheets ? "Re-analisar Ficheiro" : "Analisar Ficheiro"}
            </Button>
          )}
          {parsedSheets && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="ml-2">
              <TabsList className="h-8">
                <TabsTrigger value="comparison" className="text-xs px-3 h-7">Comparação</TabsTrigger>
                <TabsTrigger value="raw" className="text-xs px-3 h-7">
                  <Eye className="h-3 w-3 mr-1" />Ficheiro Original
                </TabsTrigger>
                <TabsTrigger value="app" className="text-xs px-3 h-7">Apenas App</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span>{forecasts.length} linhas no App</span>
        {currentSheet && (viewMode === "comparison" || viewMode === "raw") && (
          <>
            <span className="text-muted-foreground">{fileLineCount} linhas interpretadas</span>
            {originalFileTotal && (
               <span className="text-muted-foreground border-l pl-4 ml-2">
                 Total no Excel <span className="text-[10px]">(linha {originalFileTotal.rowIdx})</span>: <span className="font-semibold text-foreground">{fmtMoney(originalFileTotal.total)}</span>
               </span>
             )}
             <span className="text-muted-foreground">
               Total Interpretado: <span className="font-semibold text-foreground">{fmtMoney(fileTotalGross)}</span>
               <span className="ml-1 text-xs">(Base {fmtMoney(fileTotalBase)} + IVA {fmtMoney(fileTotalIva)})</span>
             </span>
             {originalFileTotal && Math.abs(originalFileTotal.total - fileTotalGross) > 0.5 && (
               <Badge variant="outline" className="gap-1 border-destructive/50 text-destructive">
                 <AlertTriangle className="h-3 w-3" /> Divergência: {fmtMoney(Math.abs(originalFileTotal.total - fileTotalGross))}
               </Badge>
             )}
            {!originalFileTotal && Math.abs(fileTotalGross - (fileTotalBase + fileTotalIva)) > 0.5 && (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Divergência bruto vs base+IVA: {fmtMoney(Math.abs(fileTotalGross - (fileTotalBase + fileTotalIva)))}
              </Badge>
            )}
          </>
        )}
        <span className="text-green-600 dark:text-green-400">Receitas: {fmtMoney(totalIncome)}</span>
        <span className="text-red-600 dark:text-red-400">Despesas: {fmtMoney(totalExpense)}</span>
        <span className="font-semibold">Resultado: {fmtMoney(totalIncome - totalExpense)}</span>
      </div>

      {/* Sheet mapping step */}
      {showMappingStep && sheetMappings && parsedSheets && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mapeamento de Abas do Ficheiro</CardTitle>
            <CardDescription>
              O sistema tentou associar cada aba a um evento ou data. Confirme ou corrija antes de prosseguir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sheetMappings.map((m, idx) => {
                const sheet = parsedSheets.find(s => s.sheetName === m.sheetName);
                return (
                  <div key={m.sheetName} className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{m.sheetName}</span>
                      <span className="text-xs text-muted-foreground ml-2">({sheet?.rows.length || 0} linhas)</span>
                      {m.autoMatched && (
                        <Badge variant="outline" className="ml-2 text-xs border-green-500/50 text-green-600">Auto</Badge>
                      )}
                    </div>
                    <Select
                      value={m.targetType === "ignore" ? "ignore" : `${m.targetType}:${m.targetId}`}
                      onValueChange={(v) => {
                        const updated = [...sheetMappings];
                        if (v === "ignore") {
                          updated[idx] = { ...m, targetType: "ignore", targetId: "", autoMatched: false };
                        } else {
                          const [type, id] = v.split(":");
                          updated[idx] = { ...m, targetType: type as "event" | "date", targetId: id, autoMatched: false };
                        }
                        setSheetMappings(updated);
                      }}
                    >
                      <SelectTrigger className="w-64"><SelectValue placeholder="Selecionar destino" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">❌ Ignorar</SelectItem>
                        {allEvents.map(e => (
                          <SelectItem key={`event:${e.id}`} value={`event:${e.id}`}>
                            {e.parent_event_id ? "↳ " : "🎤 "}{e.name}
                          </SelectItem>
                        ))}
                        {eventDates.length > 0 && eventDates.map((d: any) => {
                          const ev = allEvents.find(e => e.id === d.event_id);
                          return (
                            <SelectItem key={`date:${d.id}`} value={`date:${d.id}`}>
                              📅 {new Date(d.date).toLocaleDateString("pt-PT")} {d.label || ""} {ev ? `(${ev.name})` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button
                onClick={() => {
                  setShowMappingStep(false);
                  // Check if this is a multi-event tour → trigger apportionment analysis
                  const activeSheets = sheetMappings.filter(m => m.targetType !== "ignore");
                  const hasMasterEvent = allEvents.some(e => !e.parent_event_id);
                  if (activeSheets.length >= 2 && hasMasterEvent) {
                    analyzeApportionment();
                  }
                  // Select the first non-ignored sheet
                  const first = activeSheets[0];
                  if (first) {
                    setSelectedSheet(first.sheetName);
                    if (first.targetType === "event") {
                      setSelectedEventId(first.targetId);
                      setSelectedDateId("all");
                    } else if (first.targetType === "date") {
                      const date = eventDates.find((d: any) => d.id === first.targetId);
                      if (date) {
                        setSelectedEventId(date.event_id);
                        setSelectedDateId(date.id);
                      }
                    }
                  } else if (parsedSheets.length > 0) {
                    setSelectedSheet(parsedSheets[0].sheetName);
                  }
                  if (!showApportionmentStep) setViewMode("comparison");
                }}
              >
                Confirmar Mapeamento
              </Button>
              <Button variant="outline" onClick={() => setShowMappingStep(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Apportionment analysis step */}
      {showApportionmentStep && apportionmentSuggestions.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitMerge className="h-4 w-4" />
              Análise de Rateio — Custos Partilhados
            </CardTitle>
            <CardDescription>
              Os seguintes custos aparecem em múltiplas cidades. Selecione quais devem ser consolidados no evento Master (custos rateados) — os restantes serão mantidos como custos individuais de cada cidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {apportionmentSuggestions.map((s, idx) => {
                // Get the actual row data from each sheet
                const sheetDetails = s.sheets.map(sheetName => {
                  const sheet = parsedSheets?.find(ps => ps.sheetName === sheetName);
                  const rowIdx = s.rowsBySheet[sheetName];
                  const row = sheet?.rows[rowIdx];
                  const mapping = sheetMappings?.find(m => m.sheetName === sheetName);
                  const targetEvent = mapping?.targetType === "event" ? allEvents.find(e => e.id === mapping.targetId) : null;
                  return { sheetName, row, targetEvent };
                });

                return (
                  <div
                    key={s.normalizedKey}
                    className={`rounded-lg border p-3 ${s.promoteToMaster ? "border-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}
                  >
                    {/* Header with checkbox */}
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        checked={s.promoteToMaster}
                        onChange={(e) => {
                          const updated = [...apportionmentSuggestions];
                          updated[idx] = { ...updated[idx], promoteToMaster: e.target.checked };
                          setApportionmentSuggestions(updated);
                        }}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm font-semibold flex-1">{s.description}</span>
                      <Badge variant={s.promoteToMaster ? "default" : "outline"} className="text-xs">
                        {s.promoteToMaster ? "→ Master" : "Manter individual"}
                      </Badge>
                    </div>

                    {/* Detail table: one row per sheet */}
                    <div className="ml-7 rounded-md border overflow-hidden">
                      <Table>
                         <TableHeader>
                          <TableRow className="bg-muted/50">
                             <TableHead className="text-xs py-1.5 h-auto">Aba / Cidade</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto">Descrição</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto">Especificação</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto">Categoria</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto text-right">Valor Base</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto text-center">IVA</TableHead>
                             <TableHead className="text-xs py-1.5 h-auto text-right">Total</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {sheetDetails.map(({ sheetName, row, targetEvent }) => {
                             // Try to find matching forecast category for this row
                             const mapping = sheetMappings?.find(m => m.sheetName === sheetName);
                             const targetEventId = mapping?.targetType === "event" ? mapping.targetId : null;
                             return (
                             <TableRow key={sheetName}>
                               <TableCell className="text-xs py-1.5">
                                 <div>
                                   <span className="font-medium">{sheetName}</span>
                                   {targetEvent && (
                                     <span className="block text-[10px] text-muted-foreground">→ {targetEvent.name}</span>
                                   )}
                                 </div>
                               </TableCell>
                               <TableCell className="text-xs py-1.5">{row?.description || "—"}</TableCell>
                               <TableCell className="text-xs py-1.5 text-muted-foreground">{row?.specification || "—"}</TableCell>
                               <TableCell className="text-xs py-1.5 text-muted-foreground">
                                 {s.categoryId ? (() => {
                                   const cat = leafCategories.find(c => c.id === s.categoryId);
                                   return cat ? `${cat.code} ${cat.name}` : "—";
                                 })() : "—"}
                               </TableCell>
                               <TableCell className="text-xs py-1.5 text-right font-mono">{row ? fmtMoney(row.baseAmount) : "—"}</TableCell>
                               <TableCell className="text-xs py-1.5 text-center">{row ? `${row.ivaRate}%` : "—"}</TableCell>
                               <TableCell className="text-xs py-1.5 text-right font-mono">{row ? fmtMoney(row.total) : "—"}</TableCell>
                             </TableRow>
                             );
                           })}
                         </TableBody>
                      </Table>
                    </div>

                    {/* Editable category */}
                    <div className="ml-7 mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Categoria:</span>
                      <Select
                        value={s.categoryId}
                        onValueChange={(v) => {
                          const updated = [...apportionmentSuggestions];
                          updated[idx] = { ...updated[idx], categoryId: v };
                          setApportionmentSuggestions(updated);
                        }}
                      >
                        <SelectTrigger className="h-7 w-72 text-xs">
                          <SelectValue placeholder="Selecionar categoria…" />
                        </SelectTrigger>
                        <SelectContent>
                          {leafCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.code} {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!s.categoryId && (
                        <span className="text-xs text-amber-500 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Sem categoria
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Totals summary */}
            {(() => {
              const rateioTotal = apportionmentSuggestions
                .filter(s => s.promoteToMaster)
                .reduce((sum, s) => sum + s.avgAmount, 0);
              const allSheetsTotal = parsedSheets
                ? sheetMappings
                    ?.filter(m => m.targetType !== "ignore")
                    .reduce((sum, m) => {
                      const sheet = parsedSheets.find(s => s.sheetName === m.sheetName);
                      return sum + (sheet?.rows.reduce((s, r) => s + r.baseAmount, 0) ?? 0);
                    }, 0) ?? 0
                : 0;
              const remainingPerSheet = allSheetsTotal - rateioTotal * (sheetMappings?.filter(m => m.targetType !== "ignore").length ?? 1);
              return (
                <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
                  <span>Total todas as abas: <span className="font-semibold text-foreground">{fmtMoney(allSheetsTotal)}</span></span>
                  <span>Rateio (Master): <span className="font-semibold text-foreground">{fmtMoney(rateioTotal)}</span></span>
                  <span>Restante nos Splits: <span className="font-semibold text-foreground">{fmtMoney(remainingPerSheet)}</span></span>
                </div>
              );
            })()}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="text-xs text-muted-foreground">
                {apportionmentSuggestions.filter(s => s.promoteToMaster).length} de {apportionmentSuggestions.length} custos para o Master
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={applyApportionment}>
                  <GitMerge className="h-4 w-4 mr-2" />
                  Aplicar Rateio
                </Button>
                <Button variant="outline" onClick={() => setShowApportionmentStep(false)}>
                  Ignorar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Master rows indicator */}
      {masterSheetRows.length > 0 && (
        <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-primary/5 border border-primary/20">
          <GitMerge className="h-4 w-4 text-primary" />
          <span className="text-sm">
            <strong>{masterSheetRows.length}</strong> linha(s) consolidada(s) para o evento Master
            {" "}({fmtMoney(masterSheetRows.reduce((s, r) => s + r.baseAmount, 0))} total)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => {
              // Show master rows in a special view
              const masterEvent = allEvents.find(e => !e.parent_event_id);
              if (masterEvent) {
                setSelectedEventId(masterEvent.id);
                setSelectedDateId("all");
              }
            }}
          >
            Ver Master
          </Button>
        </div>
      )}

      {parsedSheets && (viewMode === "comparison" || viewMode === "raw") && (
        <div className="flex items-center gap-4 flex-wrap">
          {parsedSheets.length > 1 && (
            <Select value={selectedSheet} onValueChange={(v) => {
              setSelectedSheet(v);
              // Auto-switch event/date based on mapping
              if (sheetMappings) {
                const mapping = sheetMappings.find(m => m.sheetName === v);
                if (mapping && mapping.targetType === "event") {
                  setSelectedEventId(mapping.targetId);
                  setSelectedDateId("all");
                } else if (mapping && mapping.targetType === "date") {
                  const date = eventDates.find((d: any) => d.id === mapping.targetId);
                  if (date) {
                    setSelectedEventId(date.event_id);
                    setSelectedDateId(date.id);
                  }
                }
              }
            }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {parsedSheets.filter(s => {
                  if (!sheetMappings) return true;
                  const m = sheetMappings.find(mm => mm.sheetName === s.sheetName);
                  return !m || m.targetType !== "ignore";
                }).map((s) => {
                  const m = sheetMappings?.find(mm => mm.sheetName === s.sheetName);
                  const target = m?.targetType === "event"
                    ? allEvents.find(e => e.id === m.targetId)?.name
                    : m?.targetType === "date"
                    ? `📅 ${eventDates.find((d: any) => d.id === m?.targetId)?.date || ""}`
                    : null;
                  return (
                    <SelectItem key={s.sheetName} value={s.sheetName}>
                      {s.sheetName} ({s.rows.length}) {target ? `→ ${target}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-4 text-xs">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" /> {totalMatched} correspondências
            </Badge>
            {totalDivergent > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
                <AlertTriangle className="h-3 w-3" /> {totalDivergent} com divergências
              </Badge>
            )}
            {totalUnmatchedSource > 0 && (
              <Badge variant="outline" className="gap-1 border-red-500/50 text-red-600">
                {totalUnmatchedSource} no ficheiro sem match
              </Badge>
            )}
            {totalUnmatchedApp > 0 && (
              <Badge variant="outline" className="gap-1 border-blue-500/50 text-blue-600">
                {totalUnmatchedApp} no App sem match
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Comparison View */}
      {viewMode === "comparison" && parsedSheets ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Linha Excel</TableHead>
                    <TableHead className="bg-muted/30 border-r">Ficheiro — Descrição</TableHead>
                    <TableHead className="bg-muted/30 border-r text-right">Ficheiro — Valor</TableHead>
                    <TableHead className="bg-muted/30 border-r text-right">IVA</TableHead>
                    <TableHead className="bg-muted/30 border-r">Cat. Sugerida</TableHead>
                    <TableHead>App — Descrição</TableHead>
                    <TableHead className="text-right">App — Valor</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="w-16">Status</TableHead>
                    <TableHead className="w-28">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        Nenhuma linha para comparar
                      </TableCell>
                    </TableRow>
                  ) : matchedLines.map((line, i) => {
                    const hasDivergence = line.divergences.length > 0 && line.match && line.idx >= 0;
                    const noMatch = !line.match && line.idx >= 0;
                    const onlyApp = line.idx < 0;
                    const isRateio = line.idx >= 0 && rateioDescriptions.has(norm(line.source.description));
                    const isEditing = !isRateio && line.match && editingId === line.match.id;
                    const isEditingSource = !isRateio && line.idx >= 0 && editingSourceIdx === line.idx;
                    const cat = line.match?.account_categories;

                    return (
                      <React.Fragment key={`${line.idx}-${line.match?.id || i}`}>
                      <TableRow
                        className={`cursor-pointer ${
                          isRateio ? "bg-primary/10 opacity-75" :
                          noMatch ? "bg-red-500/5" :
                          onlyApp ? "bg-blue-500/5" :
                          hasDivergence ? "bg-amber-500/5" :
                          isEditing ? "bg-primary/5" : ""
                        }`}
                        onClick={() => line.idx >= 0 && line.source.excelRow ? setExpandedRawRow(expandedRawRow === line.idx ? null : line.idx) : undefined}
                      >
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {line.idx >= 0 ? (
                            <div className="flex flex-col items-center">
                              <span className="font-semibold">{line.source.excelRow || "?"}</span>
                              <span className="text-[10px] opacity-60">#{line.idx + 1}</span>
                            </div>
                          ) : "—"}
                        </TableCell>

                        {/* Source columns — editable */}
                        <TableCell className="border-r bg-muted/10 text-sm max-w-48">
                          {line.idx >= 0 ? (
                            isEditingSource ? (
                              <div className="space-y-1">
                                <Input className="h-7 text-xs" value={editSourceValues.description} onChange={(e) => setEditSourceValues({ ...editSourceValues, description: e.target.value })} />
                                <Input className="h-6 text-[10px]" placeholder="Especificação" value={editSourceValues.specification} onChange={(e) => setEditSourceValues({ ...editSourceValues, specification: e.target.value })} />
                              </div>
                            ) : (
                              <div>
                                {isRateio && <Badge variant="outline" className="text-[10px] mb-0.5 border-primary/50 text-primary"><GitMerge className="h-2.5 w-2.5 mr-1" />Rateio</Badge>}
                                <span>{line.source.description}</span>
                                {line.source.specification && (
                                  <span className="block text-xs text-muted-foreground">{line.source.specification}</span>
                                )}
                              </div>
                            )
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="border-r bg-muted/10 text-right font-mono text-sm">
                          {line.idx >= 0 ? (
                            isEditingSource ? (
                              <Input type="number" step="0.01" className="h-7 text-xs text-right w-24" value={editSourceValues.baseAmount} onChange={(e) => setEditSourceValues({ ...editSourceValues, baseAmount: e.target.value })} />
                            ) : fmtMoney(line.source.baseAmount)
                          ) : "—"}
                        </TableCell>
                        <TableCell className="border-r bg-muted/10 text-right text-xs">
                          {line.idx >= 0 ? (
                            isEditingSource ? (
                              <Select value={editSourceValues.ivaRate} onValueChange={(v) => setEditSourceValues({ ...editSourceValues, ivaRate: v })}>
                                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="13">13%</SelectItem>
                                  <SelectItem value="23">23%</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : `${line.source.ivaRate}%`
                          ) : "—"}
                        </TableCell>
                        {/* Suggested category for source row */}
                        <TableCell className="border-r bg-muted/10 text-xs">
                          {line.idx >= 0 ? (() => {
                            const key = `${selectedSheet}:${line.idx}`;
                            const currentCatId = sourceCategoryOverrides[key] ?? line.suggestedCategoryId ?? "";
                            const currentCat = currentCatId ? leafCategories.find(c => c.id === currentCatId) : null;
                            if (isRateio) {
                              return currentCat ? (
                                <span className="text-muted-foreground">{currentCat.code} {currentCat.name}</span>
                              ) : <span className="text-muted-foreground">—</span>;
                            }
                            return (
                              <Select
                                value={currentCatId}
                                onValueChange={(v) => setSourceCategoryOverrides(prev => ({ ...prev, [key]: v }))}
                              >
                                <SelectTrigger className="h-7 w-44 text-xs">
                                  <SelectValue placeholder="Sem cat." />
                                </SelectTrigger>
                                <SelectContent>
                                  {leafCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} {c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            );
                          })() : "—"}
                        </TableCell>

                        {/* App columns */}
                        <TableCell className="text-sm max-w-48 truncate">
                          {line.match ? (
                            isEditing ? (
                              <Input className="h-7 text-xs" value={editValues.description} onChange={(e) => setEditValues({ ...editValues, description: e.target.value })} />
                            ) : (
                              <div>
                                <span>{line.match.description}</span>
                                {line.match.specification && <span className="block text-xs text-muted-foreground">{line.match.specification}</span>}
                              </div>
                            )
                          ) : <span className="text-red-500 text-xs italic">Sem correspondência</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.match ? (
                            isEditing ? (
                              <Input type="number" step="0.01" className="h-7 text-xs text-right w-24" value={editValues.amount} onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })} />
                            ) : fmtMoney(Number(line.match.amount))
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {line.match ? (
                            isEditing ? (
                              <Select value={String(editValues.iva_rate)} onValueChange={(v) => setEditValues({ ...editValues, iva_rate: Number(v) })}>
                                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="13">13%</SelectItem>
                                  <SelectItem value="23">23%</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : `${line.match.iva_rate}%`
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {line.match ? (
                            isEditing ? (
                              <Select value={editValues.category_id} onValueChange={(v) => setEditValues({ ...editValues, category_id: v })}>
                                <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Sem cat." /></SelectTrigger>
                                <SelectContent>
                                  {leafCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} {c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : cat ? (
                              <span>{cat.code} {cat.name}</span>
                            ) : (
                              <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem cat.</span>
                            )
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {hasDivergence && (
                            <span title={line.divergences.join("\n")} className="cursor-help">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            </span>
                          )}
                          {line.match && line.idx >= 0 && line.divergences.length === 0 && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {isRateio ? (
                            <span className="text-xs text-muted-foreground italic">Bloqueado</span>
                          ) : (
                          <div className="flex items-center gap-1">
                            {/* Source row actions */}
                            {line.idx >= 0 && !isEditingSource && !isEditing && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); startEditSource(line.idx, line.source); }} title="Editar interpretação">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {isEditingSource && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); saveEditSource(); }}><Save className="h-3.5 w-3.5 text-green-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingSourceIdx(null); }}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            {/* App forecast actions */}
                            {line.match && !isEditing && !isEditingSource && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); startEdit(line.match); }} title="Editar no App">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isEditing && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); saveEdit(); }}><Save className="h-3.5 w-3.5 text-green-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            {line.match && line.idx >= 0 && hasDivergence && !isEditing && !isEditingSource && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Aplicar valores do ficheiro"
                                onClick={(e) => { e.stopPropagation(); applySourceToForecast.mutate({ forecastId: line.match.id, source: line.source }); }}>
                                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                              </Button>
                            )}
                            {line.idx >= 0 && !isEditing && !isEditingSource && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Remover esta linha da interpretação?")) deleteSourceRow(line.idx);
                              }} title="Remover linha">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {line.match && !line.idx && line.idx < 0 && !isEditing && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Remover esta previsão?")) deleteForecast.mutate(line.match.id);
                              }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {/* Expandable raw Excel values row */}
                      {expandedRawRow === line.idx && line.idx >= 0 && line.source.rawValues && (
                        <TableRow className="bg-muted/20 border-b-2 border-primary/10">
                          <TableCell className="text-[10px] text-muted-foreground text-center align-top py-2">
                            <Eye className="h-3 w-3 mx-auto" />
                          </TableCell>
                          <TableCell colSpan={10} className="py-2">
                            <div className="text-xs space-y-0.5">
                              <p className="font-semibold text-muted-foreground mb-1">Valores originais do Excel (Linha {line.source.excelRow}):</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                                {Object.entries(line.source.rawValues).map(([key, val]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="text-muted-foreground capitalize min-w-16">{key}:</span>
                                    <span className="font-mono break-all">{val || "—"}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-border/50 flex gap-6 text-muted-foreground">
                                <span>Interpretado → Base: <span className="font-mono text-foreground">{fmtMoney(line.source.baseAmount)}</span></span>
                                <span>IVA: <span className="font-mono text-foreground">{fmtMoney(line.source.ivaAmount)}</span> ({line.source.ivaRate}%)</span>
                                <span>Total: <span className="font-mono text-foreground">{fmtMoney(line.source.total)}</span></span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {matchedLines.length > 0 && (
                    <>
                      {/* Original Excel total row */}
                      {originalFileTotal && (
                        <TableRow className="bg-muted/30 border-t-2">
                          <TableCell className="text-xs text-muted-foreground">{originalFileTotal.rowIdx}</TableCell>
                          <TableCell colSpan={3} className="border-r bg-muted/20 text-sm font-semibold">
                            Total no Excel (linha original)
                          </TableCell>
                          <TableCell colSpan={2} className="text-right font-mono text-sm font-semibold">
                            {fmtMoney(originalFileTotal.total)}
                          </TableCell>
                          <TableCell colSpan={4}></TableCell>
                        </TableRow>
                      )}
                      {/* Interpreted total row */}
                      <TableRow className={`bg-muted/50 font-semibold ${originalFileTotal ? "" : "border-t-2"}`}>
                        <TableCell className="text-xs">{fileLineCount}</TableCell>
                        <TableCell className="border-r bg-muted/30 text-sm">
                          Total Interpretado ({fileLineCount} linhas)
                          <span className="block text-xs font-normal text-muted-foreground">c/ IVA: {fmtMoney(compFileTotalGross)}</span>
                        </TableCell>
                        <TableCell className="border-r bg-muted/30 text-right font-mono text-sm">{fmtMoney(compFileTotal)}</TableCell>
                        <TableCell className="border-r bg-muted/30 text-right text-xs">
                          {compFileTotalIva > 0 && fmtMoney(compFileTotalIva)}
                        </TableCell>
                        <TableCell className="text-sm">
                          Total no App
                          <span className="block text-xs font-normal text-muted-foreground">c/ IVA: {fmtMoney(compAppTotalGross)}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoney(compAppTotal)}</TableCell>
                        <TableCell className="text-right text-xs">{compAppTotalIva > 0 && fmtMoney(compAppTotalIva)}</TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          {originalFileTotal && Math.abs(originalFileTotal.total - compFileTotalGross) > 0.5 ? (
                            <span className="text-xs text-destructive font-semibold" title={`Excel: ${fmtMoney(originalFileTotal.total)} vs Interpretado c/ IVA: ${fmtMoney(compFileTotalGross)}`}>
                              <AlertTriangle className="h-4 w-4 inline mr-1" />
                              {fmtMoney(Math.abs(originalFileTotal.total - compFileTotalGross))}
                            </span>
                          ) : Math.abs(compFileTotalGross - compAppTotalGross) > 0.01 ? (
                            <span className="text-xs text-amber-600" title={`Diferença c/ IVA: ${fmtMoney(Math.abs(compFileTotalGross - compAppTotalGross))}`}>
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "raw" && parsedSheets ? (
        /* Raw Excel preview */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              {(() => {
                const raw = rawSheetData[selectedSheet];
                if (!raw || raw.length === 0) return <p className="p-6 text-muted-foreground text-center">Sem dados na aba selecionada</p>;
                const maxCols = raw.reduce((m, r) => Math.max(m, r.length), 0);
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 sticky top-0 bg-background z-10">#</TableHead>
                        {Array.from({ length: maxCols }, (_, i) => (
                          <TableHead key={i} className="sticky top-0 bg-background z-10 text-xs min-w-[80px]">
                            {String.fromCharCode(65 + (i % 26))}{i >= 26 ? String.fromCharCode(65 + Math.floor(i / 26) - 1) : ""}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {raw.map((row, ri) => {
                        const isEmpty = row.every((c: any) => String(c ?? "").trim() === "");
                        if (isEmpty && ri > 0) return null;
                        return (
                          <TableRow key={ri} className={ri === 0 ? "bg-muted/30 font-medium" : ""}>
                            <TableCell className="text-xs text-muted-foreground font-mono">{ri + 1}</TableCell>
                            {Array.from({ length: maxCols }, (_, ci) => {
                              const val = String(row[ci] ?? "");
                              const isNumber = val && !isNaN(Number(val.replace(",", "."))) && val.trim() !== "";
                              const hasError = val.includes("#REF") || val.includes("#VALUE") || val.includes("#N/A") || val.includes("#DIV");
                              return (
                                <TableCell
                                  key={ci}
                                  className={`text-xs py-1.5 px-2 ${isNumber ? "text-right font-mono" : ""} ${hasError ? "text-destructive font-semibold" : ""}`}
                                  title={val.length > 30 ? val : undefined}
                                >
                                  {val.length > 40 ? val.substring(0, 37) + "…" : val}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* App-only view (original) */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Especificação</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor Base</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">A carregar…</TableCell>
                    </TableRow>
                  ) : forecasts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma previsão encontrada</TableCell>
                    </TableRow>
                  ) : forecasts.map((f: any, idx: number) => {
                    const isEditing = editingId === f.id;
                    const cat = f.account_categories;
                    return (
                      <TableRow key={f.id} className={isEditing ? "bg-primary/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.type} onValueChange={(v) => setEditValues({ ...editValues, type: v })}>
                              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="expense">Despesa</SelectItem>
                                <SelectItem value="income">Receita</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={f.type === "expense" ? "destructive" : "default"} className="text-xs">
                              {f.type === "expense" ? "Despesa" : "Receita"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input className="h-7 text-xs" value={editValues.description} onChange={(e) => setEditValues({ ...editValues, description: e.target.value })} />
                          ) : <span className="text-sm">{f.description}</span>}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input className="h-7 text-xs" value={editValues.specification} onChange={(e) => setEditValues({ ...editValues, specification: e.target.value })} />
                          ) : <span className="text-xs text-muted-foreground">{f.specification || "—"}</span>}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.category_id} onValueChange={(v) => setEditValues({ ...editValues, category_id: v })}>
                              <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="Sem cat." /></SelectTrigger>
                              <SelectContent>
                                {leafCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} {c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">
                              {cat ? `${cat.code} ${cat.name}` : <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem cat.</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input type="number" step="0.01" className="h-7 text-xs text-right w-24" value={editValues.amount} onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })} />
                          ) : <span className="text-sm font-mono">{fmtMoney(Number(f.amount))}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Select value={String(editValues.iva_rate)} onValueChange={(v) => setEditValues({ ...editValues, iva_rate: Number(v) })}>
                              <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="6">6%</SelectItem>
                                <SelectItem value="13">13%</SelectItem>
                                <SelectItem value="23">23%</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : <span className="text-xs">{f.iva_rate}%</span>}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.status} onValueChange={(v) => setEditValues({ ...editValues, status: v })}>
                              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Rascunho</SelectItem>
                                <SelectItem value="approved">Aprovado</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : <Badge variant="outline" className="text-xs">{f.status === "draft" ? "Rascunho" : f.status === "approved" ? "Aprovado" : f.status}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Save className="h-3.5 w-3.5 text-green-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(f)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                                  if (confirm("Remover esta previsão?")) deleteForecast.mutate(f.id);
                                }}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
