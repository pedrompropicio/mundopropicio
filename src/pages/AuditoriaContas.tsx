import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, ArrowUp, ArrowDown, ArrowLeftRight, Check, X, AlertTriangle, Loader2, ChevronDown, ChevronRight, RefreshCw, GripVertical, Plus, Trash2, Pencil } from "lucide-react";
import CategoryFormModal from "@/components/CategoryFormModal";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compareHierarchicalCodes } from "@/lib/utils";
import HelpTooltip from "@/components/HelpTooltip";

interface Category { id: string; code: string; name: string; type: string; parent_id: string | null; is_active: boolean; }
interface AuditMatch { index: number; suggested_code: string; confidence: number; reason: string; }
interface AuditRow {
  source: "bp" | "tx";
  id: string;
  description: string;
  specification?: string | null;
  current_category_id: string | null;
  current_category_code: string | null;
  current_category_name: string | null;
  event_label?: string | null;
  // populated after AI
  suggested_code?: string;
  suggested_id?: string | null;
  suggested_name?: string | null;
  confidence?: number;
  reason?: string;
  // user decision (when accepted, holds the chosen target — defaults to suggested)
  chosen_id?: string | null;
  chosen_code?: string | null;
  chosen_name?: string | null;
  status?: "pending" | "accepted" | "rejected" | "applied";
}

function buildLeafSet(cats: Category[]) {
  const parents = new Set(cats.map((c) => c.parent_id).filter(Boolean) as string[]);
  return new Set(cats.filter((c) => !parents.has(c.id)).map((c) => c.id));
}

export default function AuditoriaContas() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ia" | "renumber">("ia");

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Auditoria Contas</h1>
        <p className="text-sm text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">
          Auditoria Contas
          <HelpTooltip text="Análise IA de classificações no BP/Transações por evento e gestão de numeração do Plano de Contas." />
        </h1>
        <p className="text-sm text-muted-foreground">Auditar categorias com IA e reorganizar a numeração do Plano de Contas.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="ia"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Análise IA</TabsTrigger>
          <TabsTrigger value="renumber"><ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" /> Reordenar / Trocar Códigos</TabsTrigger>
        </TabsList>

        <TabsContent value="ia" className="mt-4">
          <AnaliseIATab />
        </TabsContent>
        <TabsContent value="renumber" className="mt-4">
          <RenumberTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   Aba 1 — Análise IA
   ============================================================ */

function AnaliseIATab() {
  const qc = useQueryClient();
  const [eventId, setEventId] = useState<string>("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "diff" | "missing">("diff");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const { data: events = [] } = useQuery({
    queryKey: ["audit-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, parent_event_id, event_dates(date)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["audit-categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Category[];
    },
  });

  const leafCats = useMemo(() => {
    const leafSet = buildLeafSet(categories);
    return categories
      .filter((c) => leafSet.has(c.id) && c.type === "expense")
      .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
  }, [categories]);

  const leafCatsById = useMemo(() => new Map(leafCats.map((c) => [c.id, c])), [leafCats]);

  const eventOptions = useMemo(() => {
    // Group: masters first with their subs nested visually
    const masters = events.filter((e) => !e.parent_event_id);
    const opts: { id: string; label: string; isMaster: boolean }[] = [];
    masters.forEach((m) => {
      const subs = events.filter((e) => e.parent_event_id === m.id);
      const dateLabel = m.event_dates?.[0]?.date ? ` (${m.event_dates[0].date})` : "";
      opts.push({ id: m.id, label: subs.length ? `🎯 ${m.name}${dateLabel} — Master (${subs.length} sub)` : `${m.name}${dateLabel}`, isMaster: subs.length > 0 });
    });
    // Standalone subs (no master found) — defensive
    events.filter((e) => e.parent_event_id && !masters.some((m) => m.id === e.parent_event_id)).forEach((e) => {
      opts.push({ id: e.id, label: `↳ ${e.name}`, isMaster: false });
    });
    return opts;
  }, [events]);

  async function handleRun() {
    if (!eventId) { toast.error("Seleciona um evento"); return; }
    setRunning(true);
    setRows([]);
    try {
      // Determine event scope (master => include subs)
      const sel = events.find((e) => e.id === eventId);
      const isMaster = sel && !sel.parent_event_id;
      const subIds = isMaster ? events.filter((e) => e.parent_event_id === eventId).map((e) => e.id) : [];
      const eventIds = [eventId, ...subIds];

      const eventLabelMap = new Map<string, string>(events.map((e) => [e.id, e.name]));

      // Fetch BP forecasts (expense)
      const { data: bps, error: bpErr } = await supabase
        .from("event_forecasts")
        .select("id, description, specification, category_id, event_id, type")
        .in("event_id", eventIds)
        .eq("type", "expense");
      if (bpErr) throw bpErr;

      // Fetch transactions (expense)
      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select("id, description, category_id, event_id, type")
        .in("event_id", eventIds)
        .eq("type", "expense");
      if (txErr) throw txErr;

      const catMap = new Map(categories.map((c) => [c.id, c]));

      const merged: AuditRow[] = [
        ...(bps || []).map((b: any) => {
          const c = b.category_id ? catMap.get(b.category_id) : null;
          return {
            source: "bp" as const, id: b.id, description: b.description, specification: b.specification,
            current_category_id: b.category_id, current_category_code: c?.code ?? null, current_category_name: c?.name ?? null,
            event_label: eventLabelMap.get(b.event_id) ?? null, status: "pending" as const,
          };
        }),
        ...(txs || []).map((t: any) => {
          const c = t.category_id ? catMap.get(t.category_id) : null;
          return {
            source: "tx" as const, id: t.id, description: t.description, specification: null,
            current_category_id: t.category_id, current_category_code: c?.code ?? null, current_category_name: c?.name ?? null,
            event_label: eventLabelMap.get(t.event_id) ?? null, status: "pending" as const,
          };
        }),
      ];

      if (merged.length === 0) {
        toast.info("Nenhuma despesa para auditar neste evento.");
        setRunning(false);
        return;
      }

      // Send to AI in batches of 40
      const codeMap = new Map(leafCats.map((c) => [c.code, c]));

      const BATCH = 40;
      const allMatches: (AuditMatch & { rowIndex: number })[] = [];
      for (let i = 0; i < merged.length; i += BATCH) {
        const slice = merged.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("audit-categories", {
          body: {
            rows: slice.map((r) => ({
              source: r.source, id: r.id, description: r.description, specification: r.specification,
              current_category_code: r.current_category_code, current_category_name: r.current_category_name,
              event_label: r.event_label,
            })),
            categories: leafCats.map((c) => ({ id: c.id, code: c.code, name: c.name })),
          },
        });
        if (error) throw error;
        const matches: AuditMatch[] = data?.matches ?? [];
        matches.forEach((m) => allMatches.push({ ...m, rowIndex: i + m.index }));
      }

      const enriched = merged.map((r, idx) => {
        const m = allMatches.find((x) => x.rowIndex === idx);
        if (!m) return r;
        const cat = codeMap.get(m.suggested_code);
        return {
          ...r,
          suggested_code: m.suggested_code,
          suggested_id: cat?.id ?? null,
          suggested_name: cat?.name ?? null,
          confidence: m.confidence,
          reason: m.reason,
        };
      });

      setRows(enriched);
      toast.success(`Auditoria concluída: ${enriched.length} linhas analisadas`);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro na auditoria", { description: e.message });
    } finally {
      setRunning(false);
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.status === "applied") return false;
      if (filter === "all") return true;
      if (filter === "missing") return !r.current_category_id;
      // diff
      return r.suggested_code && r.suggested_code !== r.current_category_code;
    });
  }, [rows, filter]);

  // ---- Local decisions (no DB write yet) ----
  function acceptRow(row: AuditRow, targetId?: string) {
    setRows((prev) => prev.map((r) => {
      if (!(r.id === row.id && r.source === row.source)) return r;
      const id = targetId ?? r.suggested_id ?? null;
      if (!id) return r;
      const cat = leafCatsById.get(id);
      return {
        ...r,
        status: "accepted",
        chosen_id: id,
        chosen_code: cat?.code ?? r.suggested_code ?? null,
        chosen_name: cat?.name ?? r.suggested_name ?? null,
      };
    }));
  }

  function rejectRow(row: AuditRow) {
    setRows((prev) => prev.map((r) => (r.id === row.id && r.source === row.source ? { ...r, status: "rejected", chosen_id: null, chosen_code: null, chosen_name: null } : r)));
  }

  function resetRow(row: AuditRow) {
    setRows((prev) => prev.map((r) => (r.id === row.id && r.source === row.source ? { ...r, status: "pending", chosen_id: null, chosen_code: null, chosen_name: null } : r)));
  }

  function acceptAllVisible() {
    setRows((prev) => prev.map((r) => {
      const visible = filteredRows.some((f) => f.id === r.id && f.source === r.source);
      if (!visible || r.status === "applied" || r.status === "rejected") return r;
      if (!r.suggested_id || r.suggested_code === r.current_category_code) return r;
      const cat = leafCatsById.get(r.suggested_id);
      return { ...r, status: "accepted", chosen_id: r.suggested_id, chosen_code: cat?.code ?? r.suggested_code ?? null, chosen_name: cat?.name ?? r.suggested_name ?? null };
    }));
  }

  // ---- Commit accepted rows to DB ----
  async function commitAccepted() {
    const toApply = rows.filter((r) => r.status === "accepted" && r.chosen_id && r.chosen_id !== r.current_category_id);
    if (!toApply.length) { toast.info("Nada para aplicar"); setSummaryOpen(false); return; }
    setApplying(true);
    let ok = 0, fail = 0;
    for (const r of toApply) {
      try {
        const table = r.source === "bp" ? "event_forecasts" : "transactions";
        const { error } = await supabase.from(table).update({ category_id: r.chosen_id }).eq("id", r.id);
        if (error) throw error;
        ok++;
      } catch { fail++; }
    }
    setRows((prev) => prev.map((r) => {
      if (!toApply.some((x) => x.id === r.id && x.source === r.source)) return r;
      return {
        ...r,
        status: "applied",
        current_category_id: r.chosen_id!,
        current_category_code: r.chosen_code!,
        current_category_name: r.chosen_name!,
      };
    }));
    setApplying(false);
    setSummaryOpen(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["event_forecasts"] });
    toast.success(`${ok} aplicadas${fail ? `, ${fail} com erro` : ""}`);
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const diffs = rows.filter((r) => r.suggested_code && r.suggested_code !== r.current_category_code).length;
    const missing = rows.filter((r) => !r.current_category_id).length;
    const accepted = rows.filter((r) => r.status === "accepted" && r.chosen_id && r.chosen_id !== r.current_category_id).length;
    const rejectedCount = rows.filter((r) => r.status === "rejected").length;
    return { total, diffs, missing, accepted, rejectedCount };
  }, [rows]);

  const acceptedRows = useMemo(
    () => rows.filter((r) => r.status === "accepted" && r.chosen_id && r.chosen_id !== r.current_category_id),
    [rows]
  );

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Evento</label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger><SelectValue placeholder="Seleciona evento (Master inclui subs)" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {eventOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleRun} disabled={running || !eventId} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? "A analisar…" : "Analisar com IA"}
        </Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Total: {stats.total}</Badge>
              <Badge variant="outline" className="border-warning/40 text-warning">Disparidades: {stats.diffs}</Badge>
              <Badge variant="outline" className="border-destructive/40 text-destructive">Sem categoria: {stats.missing}</Badge>
              <Badge variant="outline" className="border-success/40 text-success">Aceites: {stats.accepted}</Badge>
              <Badge variant="outline">Rejeitadas: {stats.rejectedCount}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["diff", "missing", "all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                  {f === "diff" ? "Disparidades" : f === "missing" ? "Sem categoria" : "Todas"}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={acceptAllVisible} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Aceitar visíveis
              </Button>
              <Button size="sm" onClick={() => setSummaryOpen(true)} disabled={stats.accepted === 0} className="gap-1.5">
                Rever e aplicar ({stats.accepted})
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Clica em <Check className="inline h-3 w-3 text-success" /> para aceitar a sugestão, em <X className="inline h-3 w-3 text-destructive" /> para rejeitar, ou usa o seletor para escolher outra conta. Podes retroceder com <RefreshCw className="inline h-3 w-3" />. Nada é guardado até clicares em <strong>Rever e aplicar</strong>.
          </p>

          <div className="glass rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Origem</th>
                  <th className="px-3 py-2.5 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2.5 text-left font-medium">Evento</th>
                  <th className="px-3 py-2.5 text-left font-medium">Categoria atual</th>
                  <th className="px-3 py-2.5 text-left font-medium">Escolha</th>
                  <th className="px-3 py-2.5 text-center font-medium">Conf.</th>
                  <th className="px-3 py-2.5 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredRows.map((r) => {
                  const isDiff = r.suggested_code && r.suggested_code !== r.current_category_code;
                  const isAccepted = r.status === "accepted";
                  const isRejected = r.status === "rejected";
                  const selectValue = r.chosen_id ?? r.suggested_id ?? "";
                  return (
                    <tr key={`${r.source}-${r.id}`} className={`hover:bg-secondary/20 ${isRejected ? "opacity-50" : ""} ${isAccepted ? "bg-success/5" : ""}`}>
                      <td className="px-3 py-2">
                        <Badge variant={r.source === "bp" ? "secondary" : "outline"} className="text-[10px]">{r.source === "bp" ? "BP" : "TX"}</Badge>
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        <div className="font-medium truncate">{r.description}</div>
                        {r.specification && <div className="text-xs text-muted-foreground truncate">{r.specification}</div>}
                        {r.reason && <div className="text-[11px] text-muted-foreground italic mt-0.5">💡 {r.reason}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.event_label}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.current_category_code ? (
                          <span className="font-mono">{r.current_category_code}</span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />sem cat.</span>
                        )}
                        {r.current_category_name && <div className="text-muted-foreground">{r.current_category_name}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs min-w-[220px]">
                        {r.suggested_code && (
                          <div className="mb-1">
                            <span className="text-[10px] uppercase text-muted-foreground mr-1">IA:</span>
                            <span className={`font-mono ${isDiff ? "text-primary font-semibold" : "text-muted-foreground"}`}>{r.suggested_code}</span>
                            {r.suggested_name && <span className="text-muted-foreground"> · {r.suggested_name}</span>}
                          </div>
                        )}
                        <Select value={selectValue} onValueChange={(v) => acceptRow(r, v)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Escolher conta…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {leafCats.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-xs">
                                <span className="font-mono">{c.code}</span> · {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isAccepted && r.chosen_code && r.chosen_id !== r.suggested_id && (
                          <div className="text-[10px] text-warning mt-1">Alterado para: <span className="font-mono">{r.chosen_code}</span></div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.confidence !== undefined && (
                          <span className={`text-xs font-mono ${r.confidence >= 0.8 ? "text-success" : r.confidence >= 0.5 ? "text-warning" : "text-muted-foreground"}`}>
                            {Math.round(r.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {(r.status === "pending" || !r.status) && isDiff && (
                            <button onClick={() => acceptRow(r)} className="rounded p-1.5 hover:bg-success/10 text-success" title="Aceitar sugestão"><Check className="h-3.5 w-3.5" /></button>
                          )}
                          {(r.status === "pending" || !r.status) && (
                            <button onClick={() => rejectRow(r)} className="rounded p-1.5 hover:bg-destructive/10 text-destructive" title="Rejeitar"><X className="h-3.5 w-3.5" /></button>
                          )}
                          {(isAccepted || isRejected) && (
                            <button onClick={() => resetRow(r)} className="rounded p-1.5 hover:bg-secondary text-muted-foreground" title="Retroceder"><RefreshCw className="h-3.5 w-3.5" /></button>
                          )}
                          {isAccepted && <Badge variant="outline" className="text-[9px] border-success/40 text-success">aceite</Badge>}
                          {isRejected && <Badge variant="outline" className="text-[9px] border-muted-foreground/40 text-muted-foreground">rejeit.</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Sem linhas para mostrar com este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-success" /> Resumo das alterações</DialogTitle>
            <DialogDescription>
              Vais aplicar <strong>{acceptedRows.length}</strong> {acceptedRows.length === 1 ? "alteração" : "alterações"} de categoria. Revê antes de confirmar — esta ação grava na base de dados.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/40 backdrop-blur">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Origem</th>
                  <th className="px-2 py-2 text-left font-medium">Descrição</th>
                  <th className="px-2 py-2 text-left font-medium">Evento</th>
                  <th className="px-2 py-2 text-left font-medium">De</th>
                  <th className="px-2 py-2 text-left font-medium">Para</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {acceptedRows.map((r) => (
                  <tr key={`sum-${r.source}-${r.id}`}>
                    <td className="px-2 py-1.5"><Badge variant={r.source === "bp" ? "secondary" : "outline"} className="text-[9px]">{r.source === "bp" ? "BP" : "TX"}</Badge></td>
                    <td className="px-2 py-1.5 max-w-[220px] truncate" title={r.description}>{r.description}</td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[140px]">{r.event_label}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.current_category_code ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-primary font-semibold">{r.chosen_code}</span>
                      {r.chosen_name && <div className="text-[10px] text-muted-foreground">{r.chosen_name}</div>}
                    </td>
                  </tr>
                ))}
                {acceptedRows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sem alterações aceites.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryOpen(false)} disabled={applying}>Voltar a editar</Button>
            <Button onClick={commitAccepted} disabled={applying || acceptedRows.length === 0} className="gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {applying ? "A aplicar…" : "Confirmar e aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   Aba 2 — Reordenar / Trocar Códigos
   ============================================================ */

interface CatNode extends Category { children: CatNode[]; }
interface LeafCounts { bp: number; tx: number; camarim: number; cache_pay: number; cache_ded: number; closing: number; recurring: number; }

function buildTree(cats: Category[]): CatNode[] {
  const map = new Map<string, CatNode>();
  cats.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CatNode[] = [];
  cats.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: CatNode[]) => {
    nodes.sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function getLeafCode(code: string): number {
  const parts = code.split(".");
  return Number(parts[parts.length - 1]);
}

function getParentPrefix(code: string): string {
  const parts = code.split(".");
  parts.pop();
  return parts.join(".");
}

function pad(n: number, len: number) {
  return n < 10 && len >= 2 ? `0${n}` : String(n);
}

function detectPadding(siblings: Category[]): number {
  // detect zero-padding from existing sibling codes
  for (const s of siblings) {
    const last = s.code.split(".").pop()!;
    if (last.startsWith("0")) return last.length;
  }
  return 1;
}

function RenumberTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [swapDialog, setSwapDialog] = useState<Category | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{ updates: { id: string; oldCode: string; newCode: string }[]; impact: { catId: string; bp: number; tx: number }[] } | null>(null);
  const [addDialog, setAddDialog] = useState<Category | null>(null); // parent L2 cat
  const [newLeafName, setNewLeafName] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ cat: Category; deps: LeafCounts; reassignTo: string } | null>(null);
  const [working, setWorking] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["renumber-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data as Category[];
    },
  });

  // Per-leaf usage counts across 7 tables (single batched load)
  const { data: counts = {} } = useQuery<Record<string, LeafCounts>>({
    queryKey: ["renumber-counts"],
    queryFn: async () => {
      const tables = [
        "event_forecasts",
        "transactions",
        "camarim_items",
        "event_cache_payments",
        "event_cache_deductions",
        "event_closing_costs",
        "recurring_transactions",
      ] as const;
      const results = await Promise.all(
        tables.map((t) => supabase.from(t as any).select("category_id"))
      );
      const acc: Record<string, LeafCounts> = {};
      const keys: (keyof LeafCounts)[] = ["bp", "tx", "camarim", "cache_pay", "cache_ded", "closing", "recurring"];
      results.forEach((r, idx) => {
        const key = keys[idx];
        (r.data || []).forEach((row: any) => {
          if (!row.category_id) return;
          if (!acc[row.category_id]) acc[row.category_id] = { bp: 0, tx: 0, camarim: 0, cache_pay: 0, cache_ded: 0, closing: 0, recurring: 0 };
          acc[row.category_id][key] += 1;
        });
      });
      return acc;
    },
  });

  const tree = useMemo(() => buildTree(categories), [categories]);

  // Auto-expand top 2 levels first time
  useMemo(() => {
    if (categories.length > 0 && expanded.size === 0) {
      const ids = new Set(categories.filter((c) => c.parent_id === null).map((c) => c.id));
      setExpanded(ids);
    }
  }, [categories]);

  function toggle(id: string) {
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function fetchImpact(catIds: string[]) {
    const { data: bps } = await supabase.from("event_forecasts").select("category_id").in("category_id", catIds);
    const { data: txs } = await supabase.from("transactions").select("category_id").in("category_id", catIds);
    const out: { catId: string; bp: number; tx: number }[] = catIds.map((id) => ({
      catId: id,
      bp: (bps || []).filter((b: any) => b.category_id === id).length,
      tx: (txs || []).filter((t: any) => t.category_id === id).length,
    }));
    return out;
  }

  async function handleMove(cat: Category, dir: "up" | "down") {
    // Reorder among siblings (same parent_id)
    const siblings = categories.filter((c) => c.parent_id === cat.parent_id).sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    const idx = siblings.findIndex((s) => s.id === cat.id);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= siblings.length) return;

    // Swap positions in the array
    const reordered = [...siblings];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];

    // Renumber sequentially based on the existing min last-number among siblings
    const padLen = detectPadding(siblings);
    const minNum = Math.min(...siblings.map((s) => getLeafCode(s.code)));
    const prefix = getParentPrefix(cat.code);
    const updates: { id: string; oldCode: string; newCode: string }[] = [];
    reordered.forEach((s, i) => {
      const newLast = pad(minNum + i, padLen);
      const newCode = prefix ? `${prefix}.${newLast}` : newLast;
      if (newCode !== s.code) updates.push({ id: s.id, oldCode: s.code, newCode });
    });
    if (!updates.length) return;

    const impact = await fetchImpact(updates.map((u) => u.id));
    setPreviewDialog({ updates, impact });
  }

  async function handleSwap(target: Category) {
    if (!swapDialog) return;
    if (target.id === swapDialog.id) { toast.error("Seleciona outra conta"); return; }
    // Simple swap: temp code to avoid unique-collision if any
    const tempCode = `__tmp_${Date.now()}`;
    const updates = [
      { id: swapDialog.id, oldCode: swapDialog.code, newCode: target.code },
      { id: target.id, oldCode: target.code, newCode: swapDialog.code },
    ];
    const impact = await fetchImpact([swapDialog.id, target.id]);
    setSwapDialog(null);
    setPreviewDialog({ updates, impact });
  }

  async function applyUpdates() {
    if (!previewDialog) return;
    try {
      // 2-phase to avoid unique collisions: stage to tmp codes first
      for (const u of previewDialog.updates) {
        const { error } = await supabase.from("account_categories").update({ code: `__tmp_${u.id.slice(0, 8)}` }).eq("id", u.id);
        if (error) throw error;
      }
      for (const u of previewDialog.updates) {
        const { error } = await supabase.from("account_categories").update({ code: u.newCode }).eq("id", u.id);
        if (error) throw error;
      }
      toast.success(`${previewDialog.updates.length} código(s) atualizado(s)`);
      setPreviewDialog(null);
      qc.invalidateQueries({ queryKey: ["renumber-categories"] });
      qc.invalidateQueries({ queryKey: ["renumber-counts"] });
      qc.invalidateQueries({ queryKey: ["account-categories"] });
    } catch (e: any) {
      toast.error("Erro a aplicar", { description: e.message });
    }
  }

  /** Adiciona uma nova folha L3 sob o pai L2 escolhido. Código = próximo sequencial. */
  async function handleAddLeaf() {
    if (!addDialog) return;
    const name = newLeafName.trim();
    if (!name) { toast.error("Indica o nome da conta"); return; }
    const siblings = categories
      .filter((c) => c.parent_id === addDialog.id)
      .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    const nextNum = siblings.length > 0 ? Math.max(...siblings.map((s) => getLeafCode(s.code))) + 1 : 1;
    const newCode = `${addDialog.code}.${pad(nextNum, 2)}`;
    setWorking(true);
    try {
      const { error } = await supabase.from("account_categories").insert({
        code: newCode,
        name,
        type: addDialog.type,
        parent_id: addDialog.id,
        is_active: true,
        event_required: false,
      });
      if (error) throw error;
      toast.success(`Conta ${newCode} criada`);
      setAddDialog(null);
      setNewLeafName("");
      qc.invalidateQueries({ queryKey: ["renumber-categories"] });
      qc.invalidateQueries({ queryKey: ["renumber-counts"] });
      qc.invalidateQueries({ queryKey: ["account-categories"] });
    } catch (e: any) {
      toast.error("Erro a criar conta", { description: e.message });
    } finally {
      setWorking(false);
    }
  }

  /** Abre diálogo de exclusão. Pré-carrega dependências. */
  function openDeleteDialog(cat: Category) {
    const deps = counts[cat.id] || { bp: 0, tx: 0, camarim: 0, cache_pay: 0, cache_ded: 0, closing: 0, recurring: 0 };
    setDeleteDialog({ cat, deps, reassignTo: "" });
  }

  /** Executa exclusão com reassign opcional. */
  async function executeDelete() {
    if (!deleteDialog) return;
    const { cat, deps, reassignTo } = deleteDialog;
    const totalDeps = deps.bp + deps.tx + deps.camarim + deps.cache_pay + deps.cache_ded + deps.closing + deps.recurring;
    if (totalDeps > 0 && !reassignTo) {
      toast.error("Escolhe a conta de destino para reatribuir as dependências");
      return;
    }
    setWorking(true);
    try {
      if (totalDeps > 0) {
        // Reassign in all 7 tables (skip event_cache_deductions: PK is composite, prefer delete dups)
        const tablesToReassign = [
          "event_forecasts", "transactions", "camarim_items",
          "event_cache_payments", "event_closing_costs", "recurring_transactions",
        ] as const;
        for (const t of tablesToReassign) {
          const { error } = await supabase.from(t as any).update({ category_id: reassignTo }).eq("category_id", cat.id);
          if (error) throw error;
        }
        // event_cache_deductions: just delete rows pointing to old cat (avoid unique conflict)
        if (deps.cache_ded > 0) {
          await supabase.from("event_cache_deductions").delete().eq("category_id", cat.id);
        }
      }
      const { error: delErr } = await supabase.from("account_categories").delete().eq("id", cat.id);
      if (delErr) throw delErr;
      toast.success(`Conta ${cat.code} excluída${totalDeps > 0 ? ` · ${totalDeps} registo(s) reatribuído(s)` : ""}`);
      setDeleteDialog(null);
      qc.invalidateQueries({ queryKey: ["renumber-categories"] });
      qc.invalidateQueries({ queryKey: ["renumber-counts"] });
      qc.invalidateQueries({ queryKey: ["account-categories"] });
    } catch (e: any) {
      toast.error("Erro a excluir", { description: e.message });
    } finally {
      setWorking(false);
    }
  }
  function computeRenumberUpdates(orderedSiblings: Category[]): { id: string; oldCode: string; newCode: string }[] {
    if (orderedSiblings.length === 0) return [];
    const padLen = detectPadding(orderedSiblings);
    const minNum = Math.min(...orderedSiblings.map((s) => getLeafCode(s.code)));
    const prefix = getParentPrefix(orderedSiblings[0].code);
    const updates: { id: string; oldCode: string; newCode: string }[] = [];
    orderedSiblings.forEach((s, i) => {
      const newLast = pad(minNum + i, padLen);
      const newCode = prefix ? `${prefix}.${newLast}` : newLast;
      if (newCode !== s.code) updates.push({ id: s.id, oldCode: s.code, newCode });
    });
    return updates;
  }

  async function handleDragEnd(e: DragEndEvent, parentId: string | null) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const siblings = categories.filter((c) => c.parent_id === parentId).sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    const oldIdx = siblings.findIndex((s) => s.id === active.id);
    const newIdx = siblings.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(siblings, oldIdx, newIdx);
    const updates = computeRenumberUpdates(reordered);
    if (!updates.length) return;
    const impact = await fetchImpact(updates.map((u) => u.id));
    setPreviewDialog({ updates, impact });
  }

  /**
   * Reordena as folhas (L3) sob um pai L2 sequencialmente: 01, 02, 03…
   * Mantém a ordem visual atual (por código) e elimina apenas os saltos.
   * Começa SEMPRE em 01 (com padding 2 dígitos) — padronização.
   */
  async function handleResequenceLeaves(parentId: string) {
    const siblings = categories
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    if (!siblings.length) {
      toast.info("Sem contas-folha para reordenar");
      return;
    }
    // Confirma que são folhas (não têm filhos)
    const hasGrandchildren = siblings.some((s) => categories.some((c) => c.parent_id === s.id));
    if (hasGrandchildren) {
      toast.error("Este grupo tem subgrupos — apenas folhas (L3) podem ser reordenadas sequencialmente");
      return;
    }
    const prefix = getParentPrefix(siblings[0].code);
    const updates: { id: string; oldCode: string; newCode: string }[] = [];
    siblings.forEach((s, i) => {
      const newLast = pad(i + 1, 2);
      const newCode = prefix ? `${prefix}.${newLast}` : newLast;
      if (newCode !== s.code) updates.push({ id: s.id, oldCode: s.code, newCode });
    });
    if (!updates.length) {
      toast.success("Já está sequencial — nada a alterar");
      return;
    }
    const impact = await fetchImpact(updates.map((u) => u.id));
    setPreviewDialog({ updates, impact });
  }

  function SortableRow({ cat, level }: { cat: CatNode; level: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
    const hasChildren = cat.children.length > 0;
    const isExpanded = expanded.has(cat.id);
    const indent = level * 20;
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
    // Detect L2 parent of leaves (children exist and are all leaves themselves)
    const isL2WithLeaves = hasChildren && cat.children.every((ch) => ch.children.length === 0);
    const isLeaf = !hasChildren && !!cat.parent_id;
    const c = counts[cat.id];
    const totalDeps = c ? c.bp + c.tx + c.camarim + c.cache_pay + c.cache_ded + c.closing + c.recurring : 0;
    return (
      <div ref={setNodeRef} style={style}>
        <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/20 border-b border-border/20 bg-background" style={{ paddingLeft: `${indent + 8}px` }}>
          {cat.parent_id ? (
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5" title="Arrastar para reordenar">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          ) : <span className="w-4" />}
          {hasChildren ? (
            <button onClick={() => toggle(cat.id)} className="text-muted-foreground hover:text-foreground p-0.5">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-4" />}
          <span className={`font-mono text-xs ${level === 0 ? "font-bold" : "font-medium"} min-w-[60px]`}>{cat.code}</span>
          <span className={`text-sm ${level === 0 ? "font-bold" : level === 1 ? "font-semibold" : ""} flex-1 truncate`}>{cat.name}</span>
          <Badge variant="outline" className="text-[10px]">{cat.type === "income" ? "R" : "D"}</Badge>
          {isLeaf && c && (
            <div className="flex items-center gap-1 text-[10px]">
              {c.bp > 0 && <span title="Linhas no BP" className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">BP {c.bp}</span>}
              {c.tx > 0 && <span title="Transações" className="px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">TX {c.tx}</span>}
              {c.camarim > 0 && <span title="Itens de camarim" className="px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">CM {c.camarim}</span>}
              {c.cache_pay > 0 && <span title="Pagamentos de cachê" className="px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">CC {c.cache_pay}</span>}
              {c.cache_ded > 0 && <span title="Deduções de cachê" className="px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">DD {c.cache_ded}</span>}
              {c.closing > 0 && <span title="Custos de fecho" className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">FC {c.closing}</span>}
              {c.recurring > 0 && <span title="Transações recorrentes" className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">RC {c.recurring}</span>}
              {totalDeps === 0 && <span className="text-muted-foreground/60 italic">sem uso</span>}
            </div>
          )}
          {isL2WithLeaves && (
            <button
              onClick={() => handleResequenceLeaves(cat.id)}
              className="px-2 py-1 rounded text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
              title="Reordenar contas-folha sequencialmente (01, 02, 03…)"
            >
              Reordenar L3
            </button>
          )}
          {cat.parent_id && level === 1 && (
            <button
              onClick={() => { setAddDialog(cat); setNewLeafName(""); }}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary"
              title="Adicionar conta-folha (L3)"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {cat.parent_id && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => handleMove(cat, "up")} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleMove(cat, "down")} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => setSwapDialog(cat)} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Trocar código com…"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
              {isLeaf && (
                <button onClick={() => openDeleteDialog(cat)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Excluir conta">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {hasChildren && isExpanded && <SortableGroup nodes={cat.children} level={level + 1} parentId={cat.id} />}
      </div>
    );
  }

  function SortableGroup({ nodes, level, parentId }: { nodes: CatNode[]; level: number; parentId: string | null }) {
    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, parentId)}>
        <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {nodes.map((c) => <SortableRow key={c.id} cat={c} level={level} />)}
        </SortableContext>
      </DndContext>
    );
  }


  // siblings list for swap dialog
  const swapTargets = useMemo(() => {
    if (!swapDialog) return [];
    return categories.filter((c) => c.parent_id === swapDialog.parent_id && c.id !== swapDialog.id).sort((a, b) => compareHierarchicalCodes(a.code, b.code));
  }, [categories, swapDialog]);

  if (isLoading) return <div className="text-center text-muted-foreground py-12">A carregar…</div>;

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-3 text-xs text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div>
          A renumeração atualiza apenas os <strong>códigos</strong> das contas. Os <strong>IDs internos</strong> permanecem intactos —
          BPs, transações, fechos, cachês e camarim continuam vinculados sem perda. O preview mostra o nº de registos afetados (apenas para visibilidade).
        </div>
      </div>

      <div className="glass rounded-xl">
        <SortableGroup nodes={tree} level={0} parentId={null} />
      </div>

      {/* Swap dialog */}
      <Dialog open={!!swapDialog} onOpenChange={(o) => !o && setSwapDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar código de "{swapDialog?.code} {swapDialog?.name}"</DialogTitle>
            <DialogDescription>Escolhe a conta-irmã com a qual queres trocar o código.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {swapTargets.map((t) => (
              <button key={t.id} onClick={() => handleSwap(t)} className="w-full text-left px-3 py-2 rounded hover:bg-secondary text-sm flex items-center gap-2">
                <span className="font-mono text-xs">{t.code}</span> <span className="flex-1">{t.name}</span>
                <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {swapTargets.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem contas-irmãs disponíveis.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewDialog} onOpenChange={(o) => !o && setPreviewDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar renumeração</DialogTitle>
            <DialogDescription>Revê as alterações abaixo. Os vínculos por ID permanecem intactos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {previewDialog?.updates.map((u) => {
              const imp = previewDialog.impact.find((i) => i.catId === u.id);
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 p-2 rounded bg-secondary/30 text-sm">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-muted-foreground line-through">{u.oldCode}</span>
                    <span>→</span>
                    <span className="text-primary font-semibold">{u.newCode}</span>
                  </div>
                  {imp && <span className="text-xs text-muted-foreground">BP: {imp.bp} · TX: {imp.tx}</span>}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(null)}>Cancelar</Button>
            <Button onClick={applyUpdates}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add new leaf dialog */}
      <Dialog open={!!addDialog} onOpenChange={(o) => !o && setAddDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conta sob "{addDialog?.code} {addDialog?.name}"</DialogTitle>
            <DialogDescription>
              Será criada como conta-folha (L3) {addDialog?.type === "income" ? "de Receita" : "de Despesa"}.
              Código atribuído automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome da conta</Label>
              <Input
                value={newLeafName}
                onChange={(e) => setNewLeafName(e.target.value)}
                placeholder="Ex: Bilheteira VIP"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && !working) handleAddLeaf(); }}
              />
            </div>
            {addDialog && (() => {
              const sibs = categories.filter((c) => c.parent_id === addDialog.id);
              const next = sibs.length > 0 ? Math.max(...sibs.map((s) => getLeafCode(s.code))) + 1 : 1;
              return (
                <p className="text-xs text-muted-foreground">
                  Código previsto: <span className="font-mono font-semibold text-primary">{addDialog.code}.{pad(next, 2)}</span>
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)} disabled={working}>Cancelar</Button>
            <Button onClick={handleAddLeaf} disabled={working || !newLeafName.trim()}>
              {working ? "A criar…" : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete leaf dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir "{deleteDialog?.cat.code} {deleteDialog?.cat.name}"?</DialogTitle>
            <DialogDescription>
              {deleteDialog && (() => {
                const total = deleteDialog.deps.bp + deleteDialog.deps.tx + deleteDialog.deps.camarim +
                  deleteDialog.deps.cache_pay + deleteDialog.deps.cache_ded + deleteDialog.deps.closing + deleteDialog.deps.recurring;
                return total === 0
                  ? "Esta conta não tem registos vinculados — pode ser excluída em segurança."
                  : `Esta conta tem ${total} registo(s) vinculado(s). Escolhe a conta de destino para reatribuir antes de excluir.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          {deleteDialog && (() => {
            const d = deleteDialog.deps;
            const total = d.bp + d.tx + d.camarim + d.cache_pay + d.cache_ded + d.closing + d.recurring;
            const reassignTargets = categories
              .filter((c) => c.parent_id === deleteDialog.cat.parent_id && c.id !== deleteDialog.cat.id)
              .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
            return (
              <div className="space-y-3">
                {total > 0 && (
                  <div className="text-xs space-y-1 p-3 rounded bg-secondary/50">
                    <p className="font-medium text-foreground">Dependências encontradas:</p>
                    <div className="flex flex-wrap gap-2">
                      {d.bp > 0 && <span>BP: <strong>{d.bp}</strong></span>}
                      {d.tx > 0 && <span>Transações: <strong>{d.tx}</strong></span>}
                      {d.camarim > 0 && <span>Camarim: <strong>{d.camarim}</strong></span>}
                      {d.cache_pay > 0 && <span>Cachê (pag.): <strong>{d.cache_pay}</strong></span>}
                      {d.cache_ded > 0 && <span>Cachê (ded.): <strong>{d.cache_ded}</strong></span>}
                      {d.closing > 0 && <span>Fechos: <strong>{d.closing}</strong></span>}
                      {d.recurring > 0 && <span>Recorrentes: <strong>{d.recurring}</strong></span>}
                    </div>
                  </div>
                )}
                {total > 0 && (
                  <div>
                    <Label className="text-xs">Reatribuir registos para:</Label>
                    {reassignTargets.length === 0 ? (
                      <p className="text-sm text-destructive mt-1">
                        Não há contas-irmãs disponíveis no mesmo grupo. Cria primeiro uma conta de destino.
                      </p>
                    ) : (
                      <Select value={deleteDialog.reassignTo} onValueChange={(v) => setDeleteDialog({ ...deleteDialog, reassignTo: v })}>
                        <SelectTrigger><SelectValue placeholder="Escolhe a conta de destino…" /></SelectTrigger>
                        <SelectContent>
                          {reassignTargets.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="font-mono text-xs mr-2">{t.code}</span>{t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {d.cache_ded > 0 && (
                      <p className="text-[11px] text-warning mt-2 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        Deduções de cachê com esta categoria serão eliminadas (não reatribuídas) para evitar conflitos de unicidade.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={working}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={executeDelete}
              disabled={working || (() => {
                if (!deleteDialog) return true;
                const t = deleteDialog.deps.bp + deleteDialog.deps.tx + deleteDialog.deps.camarim +
                  deleteDialog.deps.cache_pay + deleteDialog.deps.cache_ded + deleteDialog.deps.closing + deleteDialog.deps.recurring;
                return t > 0 && !deleteDialog.reassignTo;
              })()}
            >
              {working ? "A excluir…" : "Excluir conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
