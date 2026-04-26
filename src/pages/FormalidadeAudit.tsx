import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { formatInCurrency } from "@/lib/currency";
import { FORMALIDADE_OPTIONS, FormalidadeState } from "@/components/bp-versions/FormalidadeBadge";
import {
  Sparkles,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Filter,
  Play,
} from "lucide-react";

const formatCurrency = (v: number) => formatInCurrency(v ?? 0, "EUR");

interface Suggestion {
  forecast_id: string;
  event_id: string;
  event_name: string;
  description: string;
  category_code: string | null;
  category_name: string | null;
  bp_amount: number;
  current_formalidade: FormalidadeState;
  suggested_formalidade: FormalidadeState;
  confidence: "high" | "low" | "none";
  reason: string;
  paid_total: number;
  approved_total: number;
  has_transaction: boolean;
}

interface EventOption {
  id: string;
  name: string;
}

const optionFor = (s: FormalidadeState) =>
  FORMALIDADE_OPTIONS.find((o) => o.value === s) ?? FORMALIDADE_OPTIONS[0];

function FormalidadeChip({ state }: { state: FormalidadeState }) {
  const o = optionFor(state);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${o.cls}`}
    >
      <span aria-hidden>{o.emoji}</span>
      {o.label}
    </span>
  );
}

export default function FormalidadeAudit() {
  const queryClient = useQueryClient();
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [activeTab, setActiveTab] = useState<"high" | "low">("high");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());
  const [lastApplied, setLastApplied] = useState<number | null>(null);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<Date | null>(null);

  // Lista de eventos para o filtro
  const { data: events = [] } = useQuery({
    queryKey: ["events-for-formalidade-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventOption[];
    },
  });

  const eventIdsParam = useMemo(
    () => (selectedEventIds.size === 0 ? null : Array.from(selectedEventIds)),
    [selectedEventIds],
  );

  const {
    data,
    error: analysisError,
    isError,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["formalidade-audit-bulk", eventIdsParam?.join(",") ?? "ALL"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analyze_formalidade_bulk", {
        _event_ids: eventIdsParam,
      });
      if (error) throw error;
      const rows = (data ?? []) as Suggestion[];
      setLastAnalysisAt(new Date());
      const high = rows.filter((s) => s.confidence === "high").length;
      const low = rows.filter((s) => s.confidence === "low").length;
      toast({
        title: "Análise concluída",
        description:
          rows.length === 0
            ? "Nenhuma sugestão pendente — tudo já está coerente."
            : `${rows.length} sugestão(ões): ${high} alta confiança • ${low} revisão manual.`,
      });
      return rows;
    },
    enabled: analysisRequested,
  });

  // Estatísticas (totais varridos) — independentes das sugestões
  const { data: stats } = useQuery({
    queryKey: ["formalidade-audit-stats", eventIdsParam?.join(",") ?? "ALL"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("formalidade_audit_stats", {
        _event_ids: eventIdsParam,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        total_lines: number;
        total_events: number;
        with_direct_tx: number;
        with_category_match: number;
        without_any_match: number;
        count_estimado: number;
        count_fechado: number;
        count_pago_parcial: number;
        count_pago_total: number;
      };
    },
    enabled: analysisRequested,
  });

  const { high, low, byEvent } = useMemo(() => {
    const list = data ?? [];
    const h = list.filter((s) => s.confidence === "high");
    const l = list.filter((s) => s.confidence === "low");
    const grouped = new Map<string, { event_name: string; items: Suggestion[] }>();
    for (const s of list) {
      const cur = grouped.get(s.event_id) ?? { event_name: s.event_name, items: [] };
      cur.items.push(s);
      grouped.set(s.event_id, cur);
    }
    return { high: h, low: l, byEvent: grouped };
  }, [data]);

  // Pré-seleciona todas as alta-confiança quando carrega
  useEffect(() => {
    if (data && data.length > 0) {
      setSelectedRows(new Set(data.filter((s) => s.confidence === "high").map((s) => s.forecast_id)));
    } else {
      setSelectedRows(new Set());
    }
  }, [data]);

  const applyMapMutation = useMutation({
    mutationFn: async (items: Array<{ forecast_id: string; new_state: FormalidadeState }>) => {
      const { data, error } = await supabase.rpc("apply_formalidade_suggestions_map", {
        _payload: items as any,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      setLastApplied(count);
      toast({
        title: "Sugestões aplicadas",
        description: `${count} linha(s) atualizada(s).`,
      });
      setSelectedRows(new Set());
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit-bulk"] });
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao aplicar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const applySelected = () => {
    const list = data ?? [];
    const payload = list
      .filter((s) => selectedRows.has(s.forecast_id))
      .map((s) => ({
        forecast_id: s.forecast_id,
        new_state: s.suggested_formalidade,
      }));
    if (!payload.length) {
      toast({ title: "Nenhuma linha selecionada", variant: "destructive" });
      return;
    }
    applyMapMutation.mutate(payload);
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEventGroup = (eventId: string, checked: boolean, items: Suggestion[]) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      for (const s of items) {
        if (checked) next.add(s.forecast_id);
        else next.delete(s.forecast_id);
      }
      return next;
    });
  };

  const toggleCollapse = (eventId: string) => {
    setCollapsedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const toggleEventFilter = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const runAnalysis = () => {
    setAnalysisRequested(true);
    setLastApplied(null);
    if (analysisRequested) {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit-stats"] });
    }
  };

  const selectedEventsLabel =
    selectedEventIds.size === 0
      ? "Todos os eventos"
      : selectedEventIds.size === 1
        ? events.find((e) => selectedEventIds.has(e.id))?.name ?? "1 evento"
        : `${selectedEventIds.size} eventos`;

  const tabSuggestions = activeTab === "high" ? high : low;
  const selectedInTab = tabSuggestions.filter((s) => selectedRows.has(s.forecast_id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Auditoria de Formalidade
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Selecione os eventos a analisar (ou deixe em branco para varrer todos) e clique em
            <strong className="mx-1">Analisar</strong>. As sugestões abrem por evento — pode rever e
            ajustar antes de aplicar.
          </p>
        </div>
      </div>

      {/* Painel de filtro + execução */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                {selectedEventsLabel}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="text-sm font-semibold">Filtrar por evento</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedEventIds(new Set())}
                >
                  Limpar
                </Button>
              </div>
              <ScrollArea className="h-72">
                <div className="p-2 space-y-0.5">
                  {events.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedEventIds.has(e.id)}
                        onCheckedChange={() => toggleEventFilter(e.id)}
                      />
                      <span className="text-sm truncate">{e.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Button onClick={runAnalysis} disabled={isLoading || isRefetching} className="gap-2">
            {isLoading || isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {analysisRequested ? "Re-analisar" : "Analisar"}
          </Button>

          {analysisRequested && data && lastAnalysisAt && (
            <span className="text-xs text-muted-foreground ml-auto">
              Última análise: {lastAnalysisAt.toLocaleTimeString("pt-PT")} • {data.length}{" "}
              sugestão(ões) em {byEvent.size} evento(s)
            </span>
          )}
        </CardContent>
      </Card>

      {!analysisRequested ? (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Pronto para analisar</AlertTitle>
          <AlertDescription>
            Escolha os eventos no filtro acima e clique em <strong>Analisar</strong>. Para fazer o
            catch-up inicial pós-deploy, deixe o filtro em "Todos os eventos".
          </AlertDescription>
        </Alert>
      ) : isLoading || isRefetching ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível executar a análise</AlertTitle>
          <AlertDescription>
            {(analysisError as Error)?.message ?? "Erro desconhecido ao consultar a auditoria."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {lastApplied !== null && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertTitle>Última execução: {lastApplied} linha(s) atualizada(s)</AlertTitle>
              <AlertDescription>
                A nova análise abaixo já reflete o estado atualizado.
              </AlertDescription>
            </Alert>
          )}

          {stats && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Análise concluída — resumo do que foi varrido
                </CardTitle>
                <CardDescription className="text-xs">
                  Linhas de despesa da Versão Ativa nos eventos selecionados
                  {lastAnalysisAt && ` • ${lastAnalysisAt.toLocaleString("pt-PT")}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <StatBlock label="Linhas analisadas" value={stats.total_lines} />
                  <StatBlock label="Eventos varridos" value={stats.total_events} />
                  <StatBlock
                    label="C/ TX vinculada"
                    value={stats.with_direct_tx}
                    hint="match direto"
                  />
                  <StatBlock
                    label="C/ match categoria"
                    value={stats.with_category_match}
                    hint="sem vínculo direto"
                  />
                  <StatBlock
                    label="Sem qualquer TX"
                    value={stats.without_any_match}
                    hint="mantêm estimado"
                  />
                </div>
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2 text-[11px]">
                  <span className="text-muted-foreground">Distribuição atual:</span>
                  <Badge variant="outline">Estimado: {stats.count_estimado}</Badge>
                  <Badge variant="outline">Fechado: {stats.count_fechado}</Badge>
                  <Badge variant="outline">Pago parcial: {stats.count_pago_parcial}</Badge>
                  <Badge variant="outline">Pago total: {stats.count_pago_total}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-success" /> Alta confiança
                </CardDescription>
                <CardTitle className="text-3xl">{high.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                TX paga ou aprovada com match claro — pré-selecionadas para aplicar.
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-warning" /> Revisão manual
                </CardDescription>
                <CardTitle className="text-3xl">{low.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Sem TX vinculada ou ambíguas — selecione manualmente o que aplicar.
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Eventos afetados
                </CardDescription>
                <CardTitle className="text-3xl">{byEvent.size}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Total de eventos com pelo menos uma sugestão pendente.
              </CardContent>
            </Card>
          </div>

          {high.length === 0 && low.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Análise concluída sem sugestões pendentes</AlertTitle>
              <AlertDescription>
                Nada foi alterado automaticamente. A auditoria apenas procura diferenças entre a formalidade atual e o estado inferido pelas transações vinculadas ou por match evento+categoria. Para o filtro atual, não há linhas para aplicar.
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">Sugestões agrupadas por evento</CardTitle>
                  <CardDescription>
                    As linhas marcadas serão atualizadas. Alta confiança vem pré-selecionada;
                    revisão manual fica desmarcada.
                  </CardDescription>
                </div>
                <Button
                  onClick={applySelected}
                  disabled={!selectedRows.size || applyMapMutation.isPending}
                  className="gap-2"
                >
                  {applyMapMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Aplicar selecionadas ({selectedRows.size})
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                  <TabsList>
                    <TabsTrigger value="high">
                      Alta confiança
                      {high.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {high.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="low">
                      Revisão manual
                      {low.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {low.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="high" className="mt-4">
                    <SuggestionTable
                      suggestions={high}
                      selected={selectedRows}
                      onToggle={toggleRow}
                      onToggleGroup={toggleEventGroup}
                      collapsed={collapsedEvents}
                      onToggleCollapse={toggleCollapse}
                    />
                  </TabsContent>

                  <TabsContent value="low" className="mt-4">
                    <SuggestionTable
                      suggestions={low}
                      selected={selectedRows}
                      onToggle={toggleRow}
                      onToggleGroup={toggleEventGroup}
                      collapsed={collapsedEvents}
                      onToggleCollapse={toggleCollapse}
                    />
                  </TabsContent>
                </Tabs>

                <div className="mt-3 text-xs text-muted-foreground text-right">
                  {selectedInTab} de {tabSuggestions.length} selecionada(s) nesta aba.
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionTable({
  suggestions,
  selected,
  onToggle,
  onToggleGroup,
  collapsed,
  onToggleCollapse,
}: {
  suggestions: Suggestion[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (eventId: string, checked: boolean, items: Suggestion[]) => void;
  collapsed: Set<string>;
  onToggleCollapse: (eventId: string) => void;
}) {
  if (!suggestions.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sem sugestões nesta categoria.
      </p>
    );
  }

  // Agrupa por evento
  const byEvent = new Map<string, { event_name: string; items: Suggestion[] }>();
  for (const s of suggestions) {
    const cur = byEvent.get(s.event_id) ?? { event_name: s.event_name, items: [] };
    cur.items.push(s);
    byEvent.set(s.event_id, cur);
  }

  return (
    <ScrollArea className="h-[520px] pr-3">
      <div className="space-y-4">
        {Array.from(byEvent.entries()).map(([eventId, { event_name, items }]) => {
          const isCollapsed = collapsed.has(eventId);
          const allSelected = items.every((s) => selected.has(s.forecast_id));
          const someSelected = items.some((s) => selected.has(s.forecast_id));
          const groupChecked = allSelected ? true : someSelected ? "indeterminate" : false;

          return (
            <div key={eventId} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                <Checkbox
                  checked={groupChecked as any}
                  onCheckedChange={(v) => onToggleGroup(eventId, !!v, items)}
                />
                <button
                  type="button"
                  onClick={() => onToggleCollapse(eventId)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  )}
                  <span className="text-sm font-semibold truncate">{event_name}</span>
                </button>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {items.filter((s) => selected.has(s.forecast_id)).length}/{items.length}
                </Badge>
              </div>

              {!isCollapsed && (
                <div className="divide-y">
                  {items.map((s) => (
                    <div
                      key={s.forecast_id}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/20"
                    >
                      <Checkbox
                        checked={selected.has(s.forecast_id)}
                        onCheckedChange={() => onToggle(s.forecast_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{s.description}</span>
                          {s.category_code && (
                            <span className="text-[10px] text-muted-foreground">
                              {s.category_code}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {s.reason}
                        </p>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <div className="font-semibold">{formatCurrency(s.bp_amount)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <FormalidadeChip state={s.current_formalidade} />
                        <span className="text-muted-foreground text-xs">→</span>
                        <FormalidadeChip state={s.suggested_formalidade} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
