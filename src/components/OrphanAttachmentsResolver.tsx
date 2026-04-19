/**
 * OrphanAttachmentsResolver
 *
 * Modal/wizard to manually link XLSX-imported attachment URLs that the auto-matcher
 * couldn't bind to any BP forecast row. Reads from `bp_orphan_attachments`
 * (status='pending') and writes resolutions to:
 *   - event_forecasts.attachment_refs (merge, dedup by url)
 *   - transaction_documents (when forecast has transaction_id; ref://<url>)
 *   - bp_orphan_attachments.status = 'resolved' | 'ignored'
 *
 * UX:
 *   - Left: list of pending orphan rows (sheet, description, amount, URL)
 *   - Right: Drive iframe preview (when extractable) + suggestion list (top 5 by similarity)
 *           with "anexar a múltiplas linhas" via checkboxes + free text search
 *   - Bottom actions: "Anexar a selecionadas" / "Ignorar" / "Saltar"
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Link2, EyeOff, ExternalLink, ChevronLeft, ChevronRight, Sparkles, Search } from "lucide-react";

// ---- Types ---------------------------------------------------------------

interface OrphanRow {
  id: string;
  event_id: string;
  sheet_name: string;
  row_description: string;
  row_base_amount: number;
  link_url: string;
  status: string;
}

interface ForecastRow {
  id: string;
  event_id: string;
  description: string;
  amount: number;
  transaction_id: string | null;
  attachment_refs: any;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Anchor event id (the BP context where orphans were registered). */
  eventId: string;
  /** Optional sub-event ids — included in the candidate forecast pool. */
  childEventIds?: string[];
  /** Optional master event id — included as fallback pool. */
  parentEventId?: string;
}

// ---- Similarity ---------------------------------------------------------

function norm(s: string): string {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Cheap token Jaccard similarity between two normalized strings. */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(norm(a).split(/\s+/).filter((t) => t.length > 1));
  const tb = new Set(norm(b).split(/\s+/).filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return inter / (ta.size + tb.size - inter);
}

function amountCloseness(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  const diff = Math.abs(a - b);
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  // 1 when equal, 0 when diff >= 100% of base
  return Math.max(0, 1 - diff / base);
}

function scoreCandidate(orphan: OrphanRow, f: ForecastRow): number {
  // 70% description token similarity + 30% amount closeness
  return 0.7 * tokenSimilarity(orphan.row_description, f.description) + 0.3 * amountCloseness(orphan.row_base_amount, Number(f.amount));
}

// ---- Helpers ------------------------------------------------------------

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).slice(0, 80);
  } catch {
    return url.slice(0, 60);
  }
}

// ---- Money format -------------------------------------------------------

const fmtEur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

// ---- Component ----------------------------------------------------------

export default function OrphanAttachmentsResolver({
  open,
  onOpenChange,
  eventId,
  childEventIds = [],
  parentEventId,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const allEventIds = useMemo(
    () => Array.from(new Set([eventId, ...childEventIds, ...(parentEventId ? [parentEventId] : [])])),
    [eventId, childEventIds, parentEventId],
  );

  // Pending orphans for this event
  const { data: orphans = [], isLoading: loadingOrphans } = useQuery({
    queryKey: ["bp_orphan_attachments", eventId],
    queryFn: async (): Promise<OrphanRow[]> => {
      const { data, error } = await supabase
        .from("bp_orphan_attachments")
        .select("id, event_id, sheet_name, row_description, row_base_amount, link_url, status")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .order("sheet_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrphanRow[];
    },
    enabled: open,
  });

  // Forecast pool across event + sub + master
  const { data: forecasts = [] } = useQuery({
    queryKey: ["bp_forecasts_pool", allEventIds.join(",")],
    queryFn: async (): Promise<ForecastRow[]> => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, description, amount, transaction_id, attachment_refs")
        .in("event_id", allEventIds);
      if (error) throw error;
      return (data ?? []) as any;
    },
    enabled: open && allEventIds.length > 0,
  });

  // Selected orphan index
  const [idx, setIdx] = useState(0);
  const [selectedForecastIds, setSelectedForecastIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Reset state when the modal opens or the orphans list changes shape
  useEffect(() => {
    if (open) {
      setIdx(0);
      setSelectedForecastIds(new Set());
      setSearch("");
    }
  }, [open, orphans.length]);

  const current = orphans[idx];

  // Reset selections whenever we move to a new orphan
  useEffect(() => {
    setSelectedForecastIds(new Set());
    setSearch("");
  }, [current?.id]);

  // Suggestions: ranked candidates from the same event/sub/master, top 5, with optional search filter
  const suggestions = useMemo(() => {
    if (!current) return [] as Array<ForecastRow & { _score: number }>;
    const filtered = search.trim()
      ? forecasts.filter((f) => norm(f.description).includes(norm(search)))
      : forecasts;
    return filtered
      .map((f) => ({ ...f, _score: scoreCandidate(current, f) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, search.trim() ? 30 : 5);
  }, [current, forecasts, search]);

  

  // ---- Mutations --------------------------------------------------------

  const attachMutation = useMutation({
    mutationFn: async (input: { orphan: OrphanRow; forecastIds: string[] }) => {
      const { orphan, forecastIds } = input;
      if (forecastIds.length === 0) throw new Error("Seleciona pelo menos uma linha do BP.");

      // For each selected forecast: merge attachment_refs + insert ref:// in transaction_documents (when tx exists)
      for (const fid of forecastIds) {
        const f = forecasts.find((x) => x.id === fid);
        if (!f) continue;
        const refs: { url: string }[] = Array.isArray(f.attachment_refs)
          ? (f.attachment_refs as any[]).filter((r) => r && typeof r.url === "string")
          : [];
        const has = refs.some((r) => r.url === orphan.link_url);
        if (!has) {
          refs.push({ url: orphan.link_url });
          const { error } = await supabase
            .from("event_forecasts")
            .update({ attachment_refs: refs as any } as any)
            .eq("id", f.id);
          if (error) throw error;
        }
        if (f.transaction_id) {
          const fileUrl = `ref://${orphan.link_url}`;
          // Avoid duplicate doc rows
          const { data: existing } = await supabase
            .from("transaction_documents")
            .select("id")
            .eq("transaction_id", f.transaction_id)
            .eq("file_url", fileUrl)
            .maybeSingle();
          if (!existing) {
            const { error } = await supabase.from("transaction_documents").insert({
              transaction_id: f.transaction_id,
              name: fileNameFromUrl(orphan.link_url),
              file_url: fileUrl,
              doc_type: "outro",
              uploaded_by: user?.email ?? "system",
              is_accounting: true,
            } as any);
            if (error) throw error;
          }
        }
      }

      // Mark orphan as resolved
      const { error: orphErr } = await supabase
        .from("bp_orphan_attachments")
        .update({
          status: "resolved",
          resolved_forecast_ids: forecastIds,
          resolved_by: user?.email ?? "system",
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", orphan.id);
      if (orphErr) throw orphErr;
    },
    onSuccess: () => {
      toast({ title: "Anexo vinculado" });
      qc.invalidateQueries({ queryKey: ["bp_orphan_attachments", eventId] });
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      qc.invalidateQueries({ queryKey: ["transaction_documents_summary"] });
      // Move to next: idx stays; orphans list will shrink by 1
      setIdx((i) => Math.max(0, Math.min(i, orphans.length - 2)));
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const ignoreMutation = useMutation({
    mutationFn: async (orphan: OrphanRow) => {
      const { error } = await supabase
        .from("bp_orphan_attachments")
        .update({
          status: "ignored",
          resolved_by: user?.email ?? "system",
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", orphan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Anexo ignorado" });
      qc.invalidateQueries({ queryKey: ["bp_orphan_attachments", eventId] });
      setIdx((i) => Math.max(0, Math.min(i, orphans.length - 2)));
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // ---- Render -----------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border/40 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resolver anexos órfãos
            {orphans.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({orphans.length} pendente{orphans.length === 1 ? "" : "s"})
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Estes links vieram do XLSX mas não tinham linha do BP correspondente. Indica a que linha pertencem.
          </DialogDescription>
        </DialogHeader>

        {loadingOrphans ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            A carregar…
          </div>
        ) : orphans.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 text-success" />
            <p>Sem anexos pendentes. Tudo vinculado!</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-12 overflow-hidden">
            {/* Left: list */}
            <div className="col-span-5 border-r border-border/40 overflow-hidden flex flex-col">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border/40">
                Órfãos ({orphans.length})
              </div>
              <ScrollArea className="flex-1">
                <ul className="py-1">
                  {orphans.map((o, i) => (
                    <li key={o.id}>
                      <button
                        onClick={() => setIdx(i)}
                        className={`w-full text-left px-3 py-2 text-xs border-l-2 transition-colors ${
                          i === idx
                            ? "bg-primary/10 border-primary"
                            : "border-transparent hover:bg-secondary/40"
                        }`}
                      >
                        <div className="font-medium truncate">{o.row_description || "(sem descrição)"}</div>
                        <div className="text-muted-foreground truncate">{o.sheet_name}</div>
                        <div className="text-muted-foreground">{fmtEur(o.row_base_amount)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>

            {/* Right: original row + suggestions + actions */}
            <div className="col-span-7 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-border/40">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs font-semibold text-muted-foreground">Linha original (XLSX)</div>
                  {current && (
                    <a
                      href={current.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir anexo
                    </a>
                  )}
                </div>
                {current && (
                  <div className="text-sm">
                    <div className="font-medium truncate" title={current.row_description}>{current.row_description}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="truncate">{current.sheet_name}</span>
                      <span>·</span>
                      <span className="shrink-0">{fmtEur(current.row_base_amount)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 border-b border-border/40">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Procurar outra linha do BP…"
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                <ul className="p-2 space-y-1">
                  {suggestions.length === 0 && (
                    <li className="text-xs text-muted-foreground italic px-2 py-4">
                      Sem linhas do BP nos eventos relacionados.
                    </li>
                  )}
                  {suggestions.map((s) => {
                    const checked = selectedForecastIds.has(s.id);
                    return (
                      <li key={s.id}>
                        <label
                          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                            checked ? "border-primary bg-primary/5" : "border-border/40 hover:bg-secondary/40"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              setSelectedForecastIds((prev) => {
                                const next = new Set(prev);
                                if (c) next.add(s.id); else next.delete(s.id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate" title={s.description}>
                              {s.description}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                              <span>{fmtEur(Number(s.amount))}</span>
                              {!search.trim() && (
                                <span className="ml-auto rounded bg-primary/10 text-primary px-1.5">
                                  {(s._score * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>

              <div className="border-t border-border/40 p-2 flex items-center gap-1.5 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  title="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIdx((i) => Math.min(orphans.length - 1, i + 1))}
                  disabled={idx >= orphans.length - 1}
                  title="Próximo"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => current && ignoreMutation.mutate(current)}
                  disabled={!current || ignoreMutation.isPending}
                >
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Ignorar
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    current &&
                    attachMutation.mutate({ orphan: current, forecastIds: Array.from(selectedForecastIds) })
                  }
                  disabled={!current || selectedForecastIds.size === 0 || attachMutation.isPending}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Anexar ({selectedForecastIds.size})
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
