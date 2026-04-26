import { useMemo, useState } from "react";
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
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { FORMALIDADE_OPTIONS, FormalidadeState } from "@/components/bp-versions/FormalidadeBadge";
import { Sparkles, Shield, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

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
  const [selectedLow, setSelectedLow] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"high" | "low">("high");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["formalidade-audit-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analyze_formalidade_bulk", {
        _event_ids: null,
      });
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
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

  const applyMapMutation = useMutation({
    mutationFn: async (items: Array<{ forecast_id: string; new_state: FormalidadeState }>) => {
      const { data, error } = await supabase.rpc("apply_formalidade_suggestions_map", {
        _payload: items as any,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast({
        title: "Sugestões aplicadas",
        description: `${count} linha(s) atualizada(s).`,
      });
      setSelectedLow(new Set());
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit-bulk"] });
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

  const applyAllHigh = () => {
    const payload = high.map((s) => ({
      forecast_id: s.forecast_id,
      new_state: s.suggested_formalidade,
    }));
    if (!payload.length) return;
    applyMapMutation.mutate(payload);
  };

  const applySelectedLow = () => {
    const payload = low
      .filter((s) => selectedLow.has(s.forecast_id))
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

  const toggleLow = (id: string) => {
    setSelectedLow((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllLow = () => {
    if (selectedLow.size === low.length) setSelectedLow(new Set());
    else setSelectedLow(new Set(low.map((s) => s.forecast_id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Auditoria de Formalidade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analisa todas as linhas dos BPs ativos e sugere o estado de formalidade com base nas
            transações reais.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
        >
          {isRefetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Re-analisar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-success" /> Alta confiança
                </CardDescription>
                <CardTitle className="text-3xl">{high.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                TX paga ou aprovada com match claro — pode aplicar tudo de uma vez.
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
                Casos ambíguos — selecione as linhas que deseja aplicar.
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
              <AlertTitle>Tudo em ordem</AlertTitle>
              <AlertDescription>
                Nenhuma sugestão pendente — todas as formalidades estão alinhadas com o estado real
                das transações.
              </AlertDescription>
            </Alert>
          ) : (
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

              <TabsContent value="high" className="space-y-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Sugestões de alta confiança</CardTitle>
                      <CardDescription>
                        Estas mudanças têm correspondência direta com transações reais.
                      </CardDescription>
                    </div>
                    <Button
                      onClick={applyAllHigh}
                      disabled={!high.length || applyMapMutation.isPending}
                    >
                      {applyMapMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Aplicar todas ({high.length})
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <SuggestionTable suggestions={high} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="low" className="space-y-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Sugestões para revisão manual</CardTitle>
                      <CardDescription>
                        Selecione caso a caso — sem TX vinculada o sistema mantém o estado atual.
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={toggleAllLow} disabled={!low.length}>
                        {selectedLow.size === low.length ? "Desmarcar tudo" : "Selecionar tudo"}
                      </Button>
                      <Button
                        onClick={applySelectedLow}
                        disabled={!selectedLow.size || applyMapMutation.isPending}
                      >
                        {applyMapMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Aplicar selecionadas ({selectedLow.size})
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <SuggestionTable
                      suggestions={low}
                      selectable
                      selected={selectedLow}
                      onToggle={toggleLow}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionTable({
  suggestions,
  selectable,
  selected,
  onToggle,
}: {
  suggestions: Suggestion[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
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
    <ScrollArea className="h-[500px] pr-3">
      <div className="space-y-5">
        {Array.from(byEvent.entries()).map(([eventId, { event_name, items }]) => (
          <div key={eventId}>
            <div className="flex items-center gap-2 mb-2 pb-1 border-b">
              <span className="text-sm font-semibold">{event_name}</span>
              <Badge variant="secondary" className="text-[10px]">
                {items.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {items.map((s) => (
                <div
                  key={s.forecast_id}
                  className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  {selectable && (
                    <Checkbox
                      checked={selected?.has(s.forecast_id) ?? false}
                      onCheckedChange={() => onToggle?.(s.forecast_id)}
                    />
                  )}
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
                  <div className="text-right text-xs">
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
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
