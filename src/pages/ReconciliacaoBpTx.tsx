import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Link2, EyeOff, Plus, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatInCurrency } from "@/lib/currency";
import { getL2Id } from "@/lib/bp-category-constraint";

interface CatNode { id: string; code: string; name: string; parent_id: string | null; type: string }
interface Tx {
  id: string;
  description: string | null;
  amount: number;
  type: string;
  event_id: string;
  category_id: string;
  supplier_id: string | null;
  date: string | null;
  due_date: string | null;
}
interface Forecast {
  id: string;
  description: string | null;
  amount: number;
  category_id: string;
  event_id: string;
  type: string;
  transaction_id: string | null;
}

function classify(tx: Tx, eventForecasts: Forecast[], cats: CatNode[]): "ambig" | "l2only" | "outside" | null {
  const sameCatFree = eventForecasts.filter(
    (f) => f.category_id === tx.category_id && f.type === tx.type && f.transaction_id === null,
  );
  if (sameCatFree.length >= 2) return "ambig";
  if (sameCatFree.length === 1) return "ambig"; // 1:1 should already be backfilled; treat residual as ambig
  // No same-L3. Check L2.
  const txL2 = getL2Id(tx.category_id, cats);
  const eventL2s = new Set(eventForecasts.map((f) => getL2Id(f.category_id, cats)).filter(Boolean) as string[]);
  if (txL2 && eventL2s.has(txL2)) return "l2only";
  return "outside";
}

function tokenize(s: string | null): string[] {
  if (!s) return [];
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length >= 3);
}
function similarity(a: string | null, b: string | null): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter++; });
  return inter / Math.max(A.size, B.size);
}

export default function ReconciliacaoBpTx() {
  const { user, isAdmin, isManager, role } = useAuth();
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const isPlatformAdmin = role === "platform_admin";
  const allowed = isAdmin || isManager || isPlatformAdmin;

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Categorias da empresa
  const catsQuery = useQuery({
    queryKey: ["recon-cats", companyId],
    enabled: !!companyId && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id, type")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as CatNode[];
    },
  });

  // Eventos para filtro
  const eventsQuery = useQuery({
    queryKey: ["recon-events", companyId],
    enabled: !!companyId && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });

  // TXs sem FK (LEFT JOIN event_forecasts.transaction_id)
  const txQuery = useQuery({
    queryKey: ["recon-tx", companyId, eventFilter, dateFrom, dateTo],
    enabled: !!companyId && allowed,
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, description, amount, type, event_id, category_id, supplier_id, date, due_date")
        .eq("company_id", companyId!)
        .not("event_id", "is", null)
        .not("category_id", "is", null);
      if (eventFilter !== "all") q = q.eq("event_id", eventFilter);
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      // Excluir TXs já ligadas
      const txs = (data ?? []) as Tx[];
      if (txs.length === 0) return txs;
      const { data: linked, error: e2 } = await supabase
        .from("event_forecasts")
        .select("transaction_id")
        .in("transaction_id", txs.map((t) => t.id))
        .is("version_id", null);
      if (e2) throw e2;
      const linkedSet = new Set((linked ?? []).map((r: any) => r.transaction_id));
      return txs.filter((t) => !linkedSet.has(t.id));
    },
  });

  // Forecasts dos eventos relevantes
  const forecastsQuery = useQuery({
    queryKey: ["recon-forecasts", companyId, eventFilter, txQuery.data?.length ?? 0],
    enabled: !!companyId && allowed && (txQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const eventIds = Array.from(new Set((txQuery.data ?? []).map((t) => t.event_id)));
      if (eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, amount, category_id, event_id, type, transaction_id")
        .eq("company_id", companyId!)
        .in("event_id", eventIds)
        .is("version_id", null);
      if (error) throw error;
      return (data ?? []) as Forecast[];
    },
  });

  // Ignoradas
  const ignoredQuery = useQuery({
    queryKey: ["recon-ignored", companyId],
    enabled: !!companyId && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bp_tx_reconciliation_ignored" as any)
        .select("transaction_id");
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.transaction_id as string));
    },
  });

  // Suppliers para mostrar nomes
  const suppliersQuery = useQuery({
    queryKey: ["recon-suppliers", companyId],
    enabled: !!companyId && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId!);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((s: any) => m.set(s.id, s.name));
      return m;
    },
  });

  const catById = useMemo(() => {
    const m = new Map<string, CatNode>();
    (catsQuery.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [catsQuery.data]);

  const eventName = (eid: string) => eventsQuery.data?.find((e) => e.id === eid)?.name ?? eid.slice(0, 6);
  const supplierName = (sid: string | null) => (sid ? suppliersQuery.data?.get(sid) ?? "—" : "—");
  const catLabel = (cid: string | null) => {
    if (!cid) return "—";
    const c = catById.get(cid);
    return c ? `${c.code} ${c.name}` : cid.slice(0, 6);
  };

  // Classificação
  const classified = useMemo(() => {
    if (!txQuery.data || !forecastsQuery.data || !catsQuery.data || !ignoredQuery.data) {
      return { ambig: [] as Tx[], l2only: [] as Tx[], outside: [] as Tx[] };
    }
    const ignored = ignoredQuery.data;
    const forecastsByEvent = new Map<string, Forecast[]>();
    forecastsQuery.data.forEach((f) => {
      if (!forecastsByEvent.has(f.event_id)) forecastsByEvent.set(f.event_id, []);
      forecastsByEvent.get(f.event_id)!.push(f);
    });
    const ambig: Tx[] = [], l2only: Tx[] = [], outside: Tx[] = [];
    txQuery.data.forEach((t) => {
      if (ignored.has(t.id)) return;
      const evF = forecastsByEvent.get(t.event_id) ?? [];
      const k = classify(t, evF, catsQuery.data!);
      if (k === "ambig") ambig.push(t);
      else if (k === "l2only") l2only.push(t);
      else if (k === "outside") outside.push(t);
    });
    return { ambig, l2only, outside };
  }, [txQuery.data, forecastsQuery.data, catsQuery.data, ignoredQuery.data]);

  // Mutations
  const linkMutation = useMutation({
    mutationFn: async ({ txId, forecastId }: { txId: string; forecastId: string }) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update({ transaction_id: txId })
        .eq("id", forecastId)
        .is("transaction_id", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vinculado ao BP");
      qc.invalidateQueries({ queryKey: ["recon-tx"] });
      qc.invalidateQueries({ queryKey: ["recon-forecasts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao vincular"),
  });

  const linkAndRecategorize = useMutation({
    mutationFn: async ({ txId, forecastId, newCategoryId }: { txId: string; forecastId: string; newCategoryId: string }) => {
      const { error: e1 } = await supabase
        .from("transactions")
        .update({ category_id: newCategoryId })
        .eq("id", txId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("event_forecasts")
        .update({ transaction_id: txId })
        .eq("id", forecastId)
        .is("transaction_id", null);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Categoria atualizada e vinculada ao BP");
      qc.invalidateQueries({ queryKey: ["recon-tx"] });
      qc.invalidateQueries({ queryKey: ["recon-forecasts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const createBpLineAndLink = useMutation({
    mutationFn: async ({ tx, useTxAmount }: { tx: Tx; useTxAmount: boolean }) => {
      const { data: ins, error } = await supabase
        .from("event_forecasts")
        .insert({
          company_id: companyId,
          event_id: tx.event_id,
          category_id: tx.category_id,
          type: tx.type as any,
          description: tx.description ?? "Linha BP criada via reconciliação",
          amount: useTxAmount ? tx.amount : 0,
          status: "approved",
          transaction_id: tx.id,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return ins;
    },
    onSuccess: () => {
      toast.success("Linha BP criada e vinculada");
      qc.invalidateQueries({ queryKey: ["recon-tx"] });
      qc.invalidateQueries({ queryKey: ["recon-forecasts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar linha BP"),
  });

  const ignoreMutation = useMutation({
    mutationFn: async ({ txId, reason }: { txId: string; reason: string }) => {
      const { error } = await supabase
        .from("bp_tx_reconciliation_ignored" as any)
        .insert({ company_id: companyId, transaction_id: txId, reason } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcada como órfã legítima");
      qc.invalidateQueries({ queryKey: ["recon-ignored"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reconciliação BP ↔ Transações</h1>
        <p className="text-sm text-muted-foreground">Acesso restrito a administradores e gerentes.</p>
      </div>
    );
  }

  const totalPending = classified.ambig.length + classified.l2only.length + classified.outside.length;
  const totalIgnored = ignoredQuery.data?.size ?? 0;

  const loading = catsQuery.isLoading || txQuery.isLoading || forecastsQuery.isLoading || ignoredQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Reconciliação BP ↔ Transações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transações sem ligação direta ao BP — escolha a linha correta ou marque como órfã legítima.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["recon-tx"] });
            qc.invalidateQueries({ queryKey: ["recon-forecasts"] });
            qc.invalidateQueries({ queryKey: ["recon-ignored"] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Evento</Label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {(eventsQuery.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Data desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <div className="text-sm text-muted-foreground">
              <Badge variant="outline">{classified.ambig.length} ambíguas</Badge>{" "}
              <Badge variant="outline">{classified.l2only.length} L2-only</Badge>{" "}
              <Badge variant="outline">{classified.outside.length} fora do BP</Badge>
              <div className="mt-1 text-xs">{totalIgnored} marcadas como órfãs legítimas</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <Tabs defaultValue="ambig">
          <TabsList>
            <TabsTrigger value="ambig">Ambíguas ({classified.ambig.length})</TabsTrigger>
            <TabsTrigger value="l2only">L2-only ({classified.l2only.length})</TabsTrigger>
            <TabsTrigger value="outside">Fora do BP ({classified.outside.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ambig" className="mt-4 space-y-3">
            {classified.ambig.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem transações ambíguas. ✓</p>
            )}
            {classified.ambig.map((tx) => {
              const candidates = (forecastsQuery.data ?? []).filter(
                (f) => f.event_id === tx.event_id && f.category_id === tx.category_id && f.type === tx.type && f.transaction_id === null,
              );
              const ranked = candidates
                .map((c) => ({ c, score: similarity(c.description, tx.description) }))
                .sort((a, b) => b.score - a.score);
              const suggestedId = ranked[0]?.score > 0 ? ranked[0].c.id : null;
              return (
                <TxCard
                  key={tx.id}
                  tx={tx}
                  eventName={eventName(tx.event_id)}
                  supplierName={supplierName(tx.supplier_id)}
                  categoryLabel={catLabel(tx.category_id)}
                >
                  <div className="space-y-2">
                    {ranked.map(({ c, score }) => (
                      <div key={c.id} className="flex items-start justify-between gap-3 rounded border p-2">
                        <div className="text-sm">
                          <div className="font-medium">
                            {c.description ?? "(sem descrição)"}{" "}
                            {c.id === suggestedId && <Badge variant="secondary" className="ml-1">Sugerido</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Previsto {formatInCurrency(c.amount, "EUR")} · match {Math.round(score * 100)}%
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => linkMutation.mutate({ txId: tx.id, forecastId: c.id })}
                          disabled={linkMutation.isPending}
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => ignoreMutation.mutate({ txId: tx.id, reason: "ambíguas: marcada órfã legítima" })}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> Marcar como TX órfã legítima
                    </Button>
                  </div>
                </TxCard>
              );
            })}
          </TabsContent>

          <TabsContent value="l2only" className="mt-4 space-y-3">
            {classified.l2only.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem casos L2-only. ✓</p>
            )}
            {classified.l2only.map((tx) => {
              const txL2 = getL2Id(tx.category_id, catsQuery.data ?? []);
              const candidates = (forecastsQuery.data ?? []).filter(
                (f) =>
                  f.event_id === tx.event_id &&
                  f.type === tx.type &&
                  f.transaction_id === null &&
                  getL2Id(f.category_id, catsQuery.data ?? []) === txL2,
              );
              return (
                <TxCard
                  key={tx.id}
                  tx={tx}
                  eventName={eventName(tx.event_id)}
                  supplierName={supplierName(tx.supplier_id)}
                  categoryLabel={catLabel(tx.category_id)}
                  categoryWarning="Categoria L3 não existe no BP — mas o L2 sim."
                >
                  <div className="space-y-2">
                    {candidates.map((c) => (
                      <div key={c.id} className="rounded border p-2 space-y-2">
                        <div className="text-sm">
                          <div className="font-medium">{c.description ?? "(sem descrição)"}</div>
                          <div className="text-xs text-muted-foreground">
                            {catLabel(c.category_id)} · Previsto {formatInCurrency(c.amount, "EUR")}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            onClick={() =>
                              linkAndRecategorize.mutate({
                                txId: tx.id, forecastId: c.id, newCategoryId: c.category_id,
                              })
                            }
                            disabled={linkAndRecategorize.isPending}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Vincular e mudar L3 para {catById.get(c.category_id)?.code}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 flex-wrap pt-1 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createBpLineAndLink.mutate({ tx, useTxAmount: false })}
                        disabled={createBpLineAndLink.isPending}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Criar linha BP nova com L3 atual (€0)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => ignoreMutation.mutate({ txId: tx.id, reason: "l2only: órfã legítima" })}
                      >
                        <EyeOff className="h-3.5 w-3.5 mr-1" /> TX órfã legítima
                      </Button>
                    </div>
                  </div>
                </TxCard>
              );
            })}
          </TabsContent>

          <TabsContent value="outside" className="mt-4 space-y-3">
            {classified.outside.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem casos fora do BP. ✓</p>
            )}
            {classified.outside.map((tx) => {
              const eventL2s = new Set(
                (forecastsQuery.data ?? [])
                  .filter((f) => f.event_id === tx.event_id)
                  .map((f) => getL2Id(f.category_id, catsQuery.data ?? []))
                  .filter(Boolean) as string[],
              );
              return (
                <TxCard
                  key={tx.id}
                  tx={tx}
                  eventName={eventName(tx.event_id)}
                  supplierName={supplierName(tx.supplier_id)}
                  categoryLabel={catLabel(tx.category_id)}
                  categoryWarning="Esta categoria não aparece no BP do evento. Provavelmente despesa real não prevista."
                >
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => createBpLineAndLink.mutate({ tx, useTxAmount: true })}
                      disabled={createBpLineAndLink.isPending}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Criar linha BP com esta categoria (valor da TX)
                    </Button>
                    <RecategorizeButton
                      tx={tx}
                      eventL2s={eventL2s}
                      cats={catsQuery.data ?? []}
                      catById={catById}
                      onSelect={(newId) =>
                        linkAndRecategorize.mutate({
                          txId: tx.id,
                          forecastId: "__skip__",
                          newCategoryId: newId,
                        })
                      }
                      onChangeOnly={async (newId) => {
                        const { error } = await supabase
                          .from("transactions")
                          .update({ category_id: newId })
                          .eq("id", tx.id);
                        if (error) toast.error(error.message);
                        else {
                          toast.success("Categoria atualizada");
                          qc.invalidateQueries({ queryKey: ["recon-tx"] });
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => ignoreMutation.mutate({ txId: tx.id, reason: "outside: órfã legítima" })}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> TX órfã legítima
                    </Button>
                  </div>
                </TxCard>
              );
            })}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function TxCard({
  tx, eventName, supplierName, categoryLabel, categoryWarning, children,
}: {
  tx: Tx; eventName: string; supplierName: string; categoryLabel: string;
  categoryWarning?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{tx.description ?? "(sem descrição)"}</div>
            <div className="text-xs text-muted-foreground">
              {eventName} · {formatInCurrency(tx.amount, "EUR")} · {supplierName} · {tx.date ?? tx.due_date ?? "—"}
            </div>
            <div className={`text-xs mt-1 ${categoryWarning ? "text-destructive" : "text-muted-foreground"}`}>
              Categoria: {categoryLabel}
              {categoryWarning && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <AlertTriangle className="h-3 w-3" /> {categoryWarning}
                </span>
              )}
            </div>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function RecategorizeButton({
  tx, eventL2s, cats, catById, onSelect, onChangeOnly,
}: {
  tx: Tx; eventL2s: Set<string>; cats: CatNode[];
  catById: Map<string, CatNode>;
  onSelect: (id: string) => void;
  onChangeOnly: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>("");
  // L3 cuja L2 está em eventL2s
  const options = useMemo(() => {
    return cats.filter((c) => {
      if (c.type !== tx.type) return false;
      const l2 = getL2Id(c.id, cats);
      return l2 && eventL2s.has(l2);
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [cats, eventL2s, tx.type]);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Mudar categoria para uma do BP
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2 w-full">
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Escolher L3 do BP…" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.code} {o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!val} onClick={() => { onChangeOnly(val); setOpen(false); }}>
        Aplicar (sem ligar)
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}
