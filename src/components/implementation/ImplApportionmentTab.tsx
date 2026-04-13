import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  implementation: any;
  masterEvent: any;
  splitEvents: any[];
}

interface ForecastWithEvent {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  category_id: string | null;
  category_code: string;
  category_name: string;
  event_id: string;
  event_name: string;
  type: string;
}

interface ApportionmentCandidate {
  key: string;
  description: string;
  specification: string | null;
  category_id: string | null;
  category_code: string;
  category_name: string;
  occurrences: { event_id: string; event_name: string; forecast_id: string; amount: number }[];
  totalAmount: number;
  suggested: boolean;
}

interface MasterForecastRow {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  category_id: string | null;
  category_code: string;
  category_name: string;
}

export function ImplApportionmentTab({ implementation, masterEvent, splitEvents }: Props) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [selectedMasterIds, setSelectedMasterIds] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);

  const allSplitIds = splitEvents.map((e) => e.id);

  // Fetch forecasts from all splits
  const { data: splitForecasts = [], isLoading } = useQuery({
    queryKey: ["impl-split-forecasts", allSplitIds],
    queryFn: async () => {
      if (allSplitIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, specification, amount, iva_rate, category_id, event_id, type, account_categories:category_id(code, name)")
        .in("event_id", allSplitIds)
        .eq("type", "expense")
        .order("description");
      if (error) throw error;
      return data.map((f: any) => ({
        ...f,
        category_code: f.account_categories?.code || "",
        category_name: f.account_categories?.name || "",
      })) as ForecastWithEvent[];
    },
    enabled: allSplitIds.length > 0,
  });

  // Fetch existing master forecasts (full details for distribute feature)
  const { data: masterForecasts = [] } = useQuery({
    queryKey: ["impl-master-forecasts", masterEvent.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, specification, amount, iva_rate, category_id, account_categories:category_id(code, name)")
        .eq("event_id", masterEvent.id)
        .eq("type", "expense")
        .order("description");
      if (error) throw error;
      return data.map((f: any) => ({
        ...f,
        category_code: f.account_categories?.code || "",
        category_name: f.account_categories?.name || "",
      })) as MasterForecastRow[];
    },
  });

  const eventNameMap = Object.fromEntries(splitEvents.map((e) => [e.id, e.name]));

  // Build candidates: group by category_id (or normalized description) and find items in 2+ splits
  const candidates = useMemo(() => {
    const groups = new Map<string, ApportionmentCandidate>();

    for (const f of splitForecasts) {
      const key = f.category_id || `desc:${f.description.toLowerCase().trim()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          description: f.description,
          specification: f.specification,
          category_id: f.category_id,
          category_code: f.category_code,
          category_name: f.category_name,
          occurrences: [],
          totalAmount: 0,
          suggested: false,
        });
      }
      const g = groups.get(key)!;
      if (!g.specification && f.specification) {
        g.specification = f.specification;
      } else if (f.specification && g.specification && f.specification.length > g.specification.length) {
        g.specification = f.specification;
      }
      g.occurrences.push({
        event_id: f.event_id,
        event_name: eventNameMap[f.event_id] || f.event_id,
        forecast_id: f.id,
        amount: Number(f.amount),
      });
      g.totalAmount += Number(f.amount);
    }

    const result: ApportionmentCandidate[] = [];
    for (const [, g] of groups) {
      const uniqueEvents = new Set(g.occurrences.map((o) => o.event_id));
      if (uniqueEvents.size >= 2) {
        const amounts = g.occurrences.map((o) => o.amount);
        const allSame = amounts.every((a) => Math.abs(a - amounts[0]) < 0.01);
        g.suggested = allSame;
        result.push(g);
      }
    }

    const masterCatIds = new Set(masterForecasts.map((f) => f.category_id).filter(Boolean));
    for (const c of result) {
      if (c.category_id && masterCatIds.has(c.category_id)) {
        c.suggested = false;
      }
    }

    return result.sort((a, b) => (a.suggested === b.suggested ? 0 : a.suggested ? -1 : 1));
  }, [splitForecasts, masterForecasts, eventNameMap]);

  // Auto-select suggested
  useState(() => {
    const suggested = candidates.filter((c) => c.suggested).map((c) => c.key);
    setSelectedIds(new Set(suggested));
  });

  const toggleSelect = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(candidates.map((c) => c.key)));
  const deselectAll = () => setSelectedIds(new Set());

  const toggleMasterSelect = (id: string) => {
    setSelectedMasterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllMaster = () => setSelectedMasterIds(new Set(masterForecasts.map((f) => f.id)));
  const deselectAllMaster = () => setSelectedMasterIds(new Set());

  const handlePromote = async () => {
    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos uma despesa");
      return;
    }

    setPromoting(true);
    try {
      const selected = candidates.filter((c) => selectedIds.has(c.key));

      for (const candidate of selected) {
        const avgAmount = candidate.totalAmount / candidate.occurrences.length;

        const { error: insertErr } = await supabase.from("event_forecasts").insert({
          event_id: masterEvent.id,
          type: "expense",
          description: candidate.description,
          specification: candidate.specification,
          amount: Math.round(avgAmount * 100) / 100,
          iva_rate: splitForecasts.find((f) => f.category_id === candidate.category_id)?.iva_rate || 23,
          category_id: candidate.category_id,
          status: "draft",
        });
        if (insertErr) throw insertErr;

        const forecastIds = candidate.occurrences.map((o) => o.forecast_id);
        const { error: deleteErr } = await supabase
          .from("event_forecasts")
          .delete()
          .in("id", forecastIds);
        if (deleteErr) throw deleteErr;
      }

      queryClient.invalidateQueries({ queryKey: ["impl-split-forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["impl-master-forecasts"] });
      toast.success(`${selected.length} despesa(s) promovida(s) ao Master`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error("Erro ao promover: " + err.message);
    } finally {
      setPromoting(false);
    }
  };

  const handleDistribute = async () => {
    if (selectedMasterIds.size === 0) {
      toast.error("Selecione pelo menos uma despesa do Master");
      return;
    }
    if (allSplitIds.length === 0) {
      toast.error("Nenhum sub-evento encontrado");
      return;
    }

    setDistributing(true);
    try {
      const selected = masterForecasts.filter((f) => selectedMasterIds.has(f.id));
      const splitCount = allSplitIds.length;

      for (const forecast of selected) {
        const splitAmount = Math.round((Number(forecast.amount) / splitCount) * 100) / 100;
        // Adjust last split to absorb rounding difference
        const totalDistributed = splitAmount * (splitCount - 1);
        const lastAmount = Math.round((Number(forecast.amount) - totalDistributed) * 100) / 100;

        const inserts = allSplitIds.map((eventId, idx) => ({
          event_id: eventId,
          type: "expense" as const,
          description: forecast.description,
          specification: forecast.specification,
          amount: idx === splitCount - 1 ? lastAmount : splitAmount,
          iva_rate: forecast.iva_rate,
          category_id: forecast.category_id,
          status: "draft",
        }));

        const { error: insertErr } = await supabase.from("event_forecasts").insert(inserts);
        if (insertErr) throw insertErr;

        // Delete from master
        const { error: deleteErr } = await supabase
          .from("event_forecasts")
          .delete()
          .eq("id", forecast.id);
        if (deleteErr) throw deleteErr;
      }

      queryClient.invalidateQueries({ queryKey: ["impl-split-forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["impl-master-forecasts"] });
      toast.success(`${selected.length} despesa(s) distribuída(s) para ${splitCount} sub-eventos`);
      setSelectedMasterIds(new Set());
    } catch (err: any) {
      toast.error("Erro ao distribuir: " + err.message);
    } finally {
      setDistributing(false);
    }
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">A analisar despesas…</div>;
  }

  return (
    <div className="space-y-6">
      {/* === SECTION 1: Distribute Master → Splits === */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-blue-500" />
            Distribuir Master → Sub-Eventos
          </CardTitle>
          <CardDescription>
            Despesas do Master que podem ser divididas igualmente por todos os {allSplitIds.length} sub-eventos.
          </CardDescription>
        </CardHeader>
      </Card>

      {masterForecasts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">Nenhuma despesa no Master para distribuir</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span>{masterForecasts.length} no Master</span>
              <span className="text-muted-foreground">|</span>
              <span>{selectedMasterIds.size} selecionadas</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={selectAllMaster}>Selecionar todas</Button>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={deselectAllMaster}>Limpar</Button>
            </div>
            <Button onClick={handleDistribute} disabled={distributing || selectedMasterIds.size === 0} variant="outline">
              {distributing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowDownRight className="h-4 w-4 mr-2" />}
              Distribuir ({selectedMasterIds.size}) → {allSplitIds.length} sub-eventos
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Valor/Sub-Evento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {masterForecasts.map((f) => {
                      const perSplit = Number(f.amount) / allSplitIds.length;
                      return (
                        <TableRow key={f.id} className={selectedMasterIds.has(f.id) ? "bg-blue-500/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedMasterIds.has(f.id)}
                              onCheckedChange={() => toggleMasterSelect(f.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{f.description}</TableCell>
                          <TableCell className="text-xs">
                            {f.category_code ? `${f.category_code} ${f.category_name}` : (
                              <span className="text-amber-500">Sem categoria</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{fmtMoney(Number(f.amount))}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtMoney(perSplit)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* === SECTION 2: Promote Splits → Master === */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-green-500" />
            Promover Sub-Eventos → Master
          </CardTitle>
          <CardDescription>
            Despesas que aparecem em 2 ou mais sub-eventos e podem ser consolidadas no Master como rateio.
            Despesas com mesmo valor em todos os sub-eventos são automaticamente sugeridas.
          </CardDescription>
        </CardHeader>
      </Card>

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">Nenhuma despesa candidata a rateio</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span>{candidates.length} candidatas</span>
              <span className="text-muted-foreground">|</span>
              <span>{selectedIds.size} selecionadas</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={selectAll}>Selecionar todas</Button>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={deselectAll}>Limpar</Button>
            </div>
            <Button onClick={handlePromote} disabled={promoting || selectedIds.size === 0}>
              {promoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
              Promover ao Master ({selectedIds.size})
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-center">Ocorrências</TableHead>
                      <TableHead className="text-right">Valor Médio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Sub-Eventos</TableHead>
                      <TableHead className="w-20">Sinal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => {
                      const uniqueEvents = new Set(c.occurrences.map((o) => o.event_id));
                      const avgAmount = c.totalAmount / c.occurrences.length;
                      const allSame = c.occurrences.every((o) => Math.abs(o.amount - c.occurrences[0].amount) < 0.01);
                      return (
                        <TableRow key={c.key} className={selectedIds.has(c.key) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(c.key)}
                              onCheckedChange={() => toggleSelect(c.key)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{c.description}</TableCell>
                          <TableCell className="text-xs">
                            {c.category_code ? `${c.category_code} ${c.category_name}` : (
                              <span className="text-amber-500">Sem categoria</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{c.occurrences.length} em {uniqueEvents.size} eventos</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtMoney(avgAmount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{fmtMoney(c.totalAmount)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {Array.from(uniqueEvents).map((eid) => {
                                const evName = eventNameMap[eid] || eid;
                                const shortName = evName.includes("—") ? evName.split("—").pop()?.trim() : evName;
                                return (
                                  <Badge key={eid} variant="outline" className="text-xs">
                                    {shortName}
                                  </Badge>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            {allSame ? (
                              <Badge className="text-xs bg-green-600">Forte</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Dif.
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}