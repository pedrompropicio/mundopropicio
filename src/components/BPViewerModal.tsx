import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/mock-data";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import ReportBPTransactions from "@/components/ReportBPTransactions";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Read-only BP viewer for editors (and admins/managers) to consult forecasts
 * and BP-vs-Real comparison without leaving the Transactions page.
 *
 * Tab "Previsões": simple grouped list of approved forecasts for the event.
 * Tab "Previsão vs Real": embeds the existing report component (already read-only).
 */
export default function BPViewerModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<"forecast" | "comparison">("forecast");
  const [eventId, setEventId] = useState<string>("");

  const { data: events = [] } = useQuery({
    queryKey: ["bp-viewer-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, parent_event_id, status")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Group: standalone/parents first, children indented (matches ReportBPTransactions UX)
  const grouped = useMemo(() => {
    const parents = events.filter((e: any) => !e.parent_event_id);
    const childMap: Record<string, any[]> = {};
    events
      .filter((e: any) => e.parent_event_id)
      .forEach((e: any) => {
        (childMap[e.parent_event_id] ||= []).push(e);
      });
    Object.values(childMap).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    const out: { id: string; name: string; date: string; isChild: boolean }[] = [];
    parents.forEach((p: any) => {
      out.push({ id: p.id, name: p.name, date: p.date, isChild: false });
      (childMap[p.id] || []).forEach((c: any) => out.push({ id: c.id, name: c.name, date: c.date, isChild: true }));
    });
    return out;
  }, [events]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultar Business Plan</DialogTitle>
          <DialogDescription>
            Vista de consulta — Previsões aprovadas e comparação com o real lançado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className={e.isChild ? "pl-4 text-muted-foreground" : ""}>
                      {e.isChild ? "↳ " : ""}{e.name} — {e.date}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "forecast" | "comparison")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="forecast">Previsões</TabsTrigger>
              <TabsTrigger value="comparison">Previsão vs Real</TabsTrigger>
            </TabsList>

            <TabsContent value="forecast" className="mt-4">
              {eventId ? (
                <ForecastReadOnlyView eventId={eventId} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Selecione um evento para ver as previsões.
                </p>
              )}
            </TabsContent>

            <TabsContent value="comparison" className="mt-4">
              {/* The report already has its own internal event selector; we render
                  it with initialEventId so it syncs with our outer dropdown. */}
              <ReportBPTransactions key={eventId} initialEventId={eventId || undefined} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Read-only forecast list ─────────────────────────

function ForecastReadOnlyView({ eventId }: { eventId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["bp-viewer-event-children", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, parent_event_id");
      if (error) throw error;
      return data;
    },
  });

  const relevantIds = useMemo(() => {
    const childIds = events.filter((e: any) => e.parent_event_id === eventId).map((e: any) => e.id);
    return [eventId, ...childIds];
  }, [eventId, events]);

  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["bp-viewer-forecasts", relevantIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, amount, type, status, category_id, event_id, is_transitory, exclude_from_result")
        .in("event_id", relevantIds)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
    enabled: relevantIds.length > 0,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["bp-viewer-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  const lookup = useMemo(() => buildCategoryLookup(categories as CategoryNode[]), [categories]);

  const groups = useMemo(() => {
    type Cat = { code: string; name: string; amount: number; lines: any[] };
    type Group = { code: string; name: string; total: number; cats: Map<string, Cat> };
    const byType: Record<"revenue" | "expense", Map<string, Group>> = {
      revenue: new Map(),
      expense: new Map(),
    };

    for (const f of forecasts) {
      if (!f.category_id) continue;
      const cat = lookup[f.category_id];
      if (!cat) continue;
      const t = f.type as "revenue" | "expense";
      const map = byType[t];
      const g = map.get(cat.groupCode) ?? { code: cat.groupCode, name: cat.groupName, total: 0, cats: new Map() };
      const c = g.cats.get(cat.code) ?? { code: cat.code, name: cat.name, amount: 0, lines: [] };
      const amt = Number(f.amount);
      c.amount += amt;
      c.lines.push(f);
      g.cats.set(cat.code, c);
      g.total += amt;
      map.set(cat.groupCode, g);
    }

    const sortGroups = (m: Map<string, Group>) =>
      Array.from(m.values())
        .sort((a, b) => compareHierarchicalCodes(a.code, b.code))
        .map((g) => ({
          ...g,
          cats: Array.from(g.cats.values()).sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
        }));

    return {
      revenue: sortGroups(byType.revenue),
      expense: sortGroups(byType.expense),
      totalRevenue: forecasts.filter((f: any) => f.type === "revenue").reduce((s: number, f: any) => s + Number(f.amount), 0),
      totalExpense: forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0),
    };
  }, [forecasts, lookup]);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">A carregar previsões…</p>;
  }

  if (forecasts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem previsões aprovadas para este evento.</p>;
  }

  const result = groups.totalRevenue - groups.totalExpense;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Receitas (BP)" value={groups.totalRevenue} tone="success" />
        <SummaryCard label="Despesas (BP)" value={groups.totalExpense} tone="muted" />
        <SummaryCard label="Resultado previsto" value={result} tone={result >= 0 ? "success" : "destructive"} />
      </div>

      <Section title="Receitas Previstas" groups={groups.revenue} emptyText="Sem receitas previstas." />
      <Section title="Despesas Previstas" groups={groups.expense} emptyText="Sem despesas previstas." />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "success" | "destructive" | "muted" }) {
  const color =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-base font-semibold ${color}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function Section({ title, groups, emptyText }: { title: string; groups: any[]; emptyText: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {groups.length === 0 ? (
        <p className="rounded-lg bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60%]">Categoria</TableHead>
                <TableHead className="text-right">Linhas</TableHead>
                <TableHead className="text-right">Valor (s/IVA)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRows key={g.code} group={g} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
