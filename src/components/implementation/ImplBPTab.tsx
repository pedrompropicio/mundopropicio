import { useState, useMemo, useCallback } from "react";
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
import { X, Pencil, Save, AlertTriangle, CheckCircle2, FileSearch, Loader2, ArrowRight } from "lucide-react";
import { parseXlsxPL, type ParsedRow, type ParsedSheet } from "@/lib/import-pl-xlsx";

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

export function ImplBPTab({ implementation, event, allEvents }: Props) {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>(event?.id || "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [viewMode, setViewMode] = useState<"comparison" | "app">("app");

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

      const sheets = parseXlsxPL(buffer);
      setParsedSheets(sheets);
      if (sheets.length > 0) {
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

  // Build matched lines
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

      lines.push({ idx: i, source: row, match: bestMatch, matchScore: bestScore, divergences: bestDivergences });
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
        });
      }
    }

    return lines;
  }, [parsedSheets, selectedSheet, forecasts]);

  // Stats
  const totalMatched = matchedLines.filter((l) => l.match && l.idx >= 0).length;
  const totalDivergent = matchedLines.filter((l) => l.match && l.idx >= 0 && l.divergences.length > 0).length;
  const totalUnmatchedSource = matchedLines.filter((l) => !l.match && l.idx >= 0).length;
  const totalUnmatchedApp = matchedLines.filter((l) => l.idx < 0).length;

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

  const totalExpense = forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const totalIncome = forecasts.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      {/* Event selector + File analysis button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {allEvents.length > 1 && (
            <>
              <span className="text-sm font-medium text-muted-foreground">Evento:</span>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
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
                <TabsTrigger value="app" className="text-xs px-3 h-7">Apenas App</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span>{forecasts.length} linhas no App</span>
        <span className="text-green-600 dark:text-green-400">Receitas: {fmtMoney(totalIncome)}</span>
        <span className="text-red-600 dark:text-red-400">Despesas: {fmtMoney(totalExpense)}</span>
        <span className="font-semibold">Resultado: {fmtMoney(totalIncome - totalExpense)}</span>
      </div>

      {/* Comparison stats */}
      {parsedSheets && viewMode === "comparison" && (
        <div className="flex items-center gap-4 flex-wrap">
          {parsedSheets.length > 1 && (
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {parsedSheets.map((s) => (
                  <SelectItem key={s.sheetName} value={s.sheetName}>
                    {s.sheetName} ({s.rows.length} linhas)
                  </SelectItem>
                ))}
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
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="bg-muted/30 border-r">Ficheiro — Descrição</TableHead>
                    <TableHead className="bg-muted/30 border-r text-right">Ficheiro — Valor</TableHead>
                    <TableHead className="bg-muted/30 border-r text-right">IVA</TableHead>
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
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nenhuma linha para comparar
                      </TableCell>
                    </TableRow>
                  ) : matchedLines.map((line, i) => {
                    const hasDivergence = line.divergences.length > 0 && line.match && line.idx >= 0;
                    const noMatch = !line.match && line.idx >= 0;
                    const onlyApp = line.idx < 0;
                    const isEditing = line.match && editingId === line.match.id;
                    const cat = line.match?.account_categories;

                    return (
                      <TableRow
                        key={`${line.idx}-${line.match?.id || i}`}
                        className={
                          noMatch ? "bg-red-500/5" :
                          onlyApp ? "bg-blue-500/5" :
                          hasDivergence ? "bg-amber-500/5" :
                          isEditing ? "bg-primary/5" : ""
                        }
                      >
                        <TableCell className="text-xs text-muted-foreground">{line.idx >= 0 ? line.idx + 1 : "—"}</TableCell>

                        {/* Source columns */}
                        <TableCell className="border-r bg-muted/10 text-sm max-w-48 truncate">
                          {line.idx >= 0 ? (
                            <div>
                              <span>{line.source.description}</span>
                              {line.source.specification && (
                                <span className="block text-xs text-muted-foreground">{line.source.specification}</span>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="border-r bg-muted/10 text-right font-mono text-sm">
                          {line.idx >= 0 ? fmtMoney(line.source.baseAmount) : "—"}
                        </TableCell>
                        <TableCell className="border-r bg-muted/10 text-right text-xs">
                          {line.idx >= 0 ? `${line.source.ivaRate}%` : "—"}
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
                          <div className="flex items-center gap-1">
                            {line.match && !isEditing && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(line.match)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isEditing && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Save className="h-3.5 w-3.5 text-green-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            {line.match && line.idx >= 0 && hasDivergence && !isEditing && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="Aplicar valores do ficheiro"
                                onClick={() => applySourceToForecast.mutate({ forecastId: line.match.id, source: line.source })}
                              >
                                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                              </Button>
                            )}
                            {line.match && !isEditing && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                                if (confirm("Remover esta previsão?")) deleteForecast.mutate(line.match.id);
                              }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
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
