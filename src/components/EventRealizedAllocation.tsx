import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Loader2, AlertTriangle, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventName?: string;
}

interface Cat {
  id: string;
  code: string | null;
  name: string;
  parent_id: string | null;
  type: string;
}

interface Tx {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  iva_rate: number | null;
  category_id: string | null;
  status: string | null;
  supplier_id: string | null;
}

interface Forecast {
  id: string;
  category_id: string | null;
  amount: number;
  iva_rate: number | null;
}

const withIva = (amount: number, iva: number | null | undefined) =>
  Number(amount || 0) * (1 + Number(iva || 0) / 100);

export function EventRealizedAllocation({ open, onOpenChange, eventId, eventName }: Props) {
  const qc = useQueryClient();
  const [localCat, setLocalCat] = useState<Record<string, string | null>>({});

  const { data: cats = [], isLoading: loadingCats } = useQuery({
    queryKey: ["ac_all_expense"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id, type")
        .eq("type", "expense");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
    enabled: open,
  });

  const { data: forecasts = [], isLoading: loadingF } = useQuery({
    queryKey: ["ra_forecasts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, category_id, amount, iva_rate")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .is("version_id", null)
        .in("status", ["approved", "draft"]);
      if (error) throw error;
      return (data ?? []) as Forecast[];
    },
    enabled: open,
  });

  const { data: txs = [], isLoading: loadingT, refetch } = useQuery({
    queryKey: ["ra_txs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, description, amount, iva_rate, category_id, status, supplier_id")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .is("reversed_at", null)
        .or("is_hidden.is.null,is_hidden.eq.false")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
    enabled: open,
  });

  const updateMut = useMutation({
    mutationFn: async ({ txId, categoryId }: { txId: string; categoryId: string | null }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Transação realocada" });
      qc.invalidateQueries({ queryKey: ["ra_txs", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["partner_realized", eventId] });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  // level helpers
  const levelOf = (id: string | null | undefined): 1 | 2 | 3 | null => {
    if (!id) return null;
    const c = byId.get(id);
    if (!c) return null;
    if (!c.parent_id) return 1;
    const p = byId.get(c.parent_id);
    if (!p) return null;
    if (!p.parent_id) return 2;
    return 3;
  };
  const l2Of = (id: string | null | undefined): string | null => {
    const lv = levelOf(id);
    if (lv === 2) return id!;
    if (lv === 3) return byId.get(id!)!.parent_id;
    return null;
  };

  const l1s = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const l2s = useMemo(() => cats.filter((c) => c.parent_id && byId.get(c.parent_id!) && !byId.get(c.parent_id!)!.parent_id), [cats, byId]);
  const l3sByL2 = useMemo(() => {
    const map = new Map<string, Cat[]>();
    for (const c of cats) {
      if (c.parent_id) {
        const p = byId.get(c.parent_id);
        if (p && p.parent_id) {
          const arr = map.get(c.parent_id) ?? [];
          arr.push(c);
          map.set(c.parent_id, arr);
        }
      }
    }
    for (const [, arr] of map) arr.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    return map;
  }, [cats, byId]);

  // Effective category (local override or DB)
  const effCat = (tx: Tx) => (tx.id in localCat ? localCat[tx.id] : tx.category_id);

  // Group L2 realized by summing tx (c/IVA) using effective category
  const realizedByL3 = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) {
      const cat = effCat(t);
      if (!cat) continue;
      const v = withIva(t.amount, t.iva_rate);
      m.set(cat, (m.get(cat) ?? 0) + v);
    }
    return m;
  }, [txs, localCat]);

  const previstoByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of forecasts) {
      if (!f.category_id) continue;
      m.set(f.category_id, (m.get(f.category_id) ?? 0) + withIva(f.amount, f.iva_rate));
    }
    return m;
  }, [forecasts]);

  // Which L2s to show: those with any forecast OR any tx
  const activeL2Ids = useMemo(() => {
    const s = new Set<string>();
    for (const [cat] of previstoByCat) {
      const l2 = l2Of(cat);
      if (l2) s.add(l2);
    }
    for (const t of txs) {
      const cat = effCat(t);
      const l2 = l2Of(cat);
      if (l2) s.add(l2);
    }
    return s;
  }, [previstoByCat, txs, localCat, byId]);

  const txsByL2 = useMemo(() => {
    const m = new Map<string, Tx[]>();
    const noCat: Tx[] = [];
    for (const t of txs) {
      const cat = effCat(t);
      const l2 = l2Of(cat);
      if (!cat) {
        noCat.push(t);
      } else if (l2) {
        const arr = m.get(l2) ?? [];
        arr.push(t);
        m.set(l2, arr);
      } else {
        // categorised at L1 only — treat as "sem categoria"
        noCat.push(t);
      }
    }
    return { byL2: m, noCat };
  }, [txs, localCat, byId]);

  const unallocatedCount = useMemo(
    () => txs.filter((t) => {
      const c = effCat(t);
      return !c || levelOf(c) !== 3;
    }).length,
    [txs, localCat, byId],
  );

  const isLoading = loadingCats || loadingF || loadingT;

  const handleChange = (tx: Tx, newCatId: string) => {
    setLocalCat((prev) => ({ ...prev, [tx.id]: newCatId }));
    updateMut.mutate({ txId: tx.id, categoryId: newCatId });
  };

  const catLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const c = byId.get(id);
    return c ? `${c.code ?? ""} ${c.name}`.trim() : "—";
  };

  const l2Sorted = useMemo(
    () => Array.from(activeL2Ids).map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => (a.code || "").localeCompare(b.code || "")),
    [activeL2Ids, byId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Alocação do Realizado {eventName ? `— ${eventName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Realoca transações entre L3 <strong>dentro do mesmo L2</strong>. Os totais L2 não mudam. Mudanças são aplicadas de imediato e reversíveis alterando de volta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 text-xs">
          <Badge variant={unallocatedCount > 0 ? "destructive" : "secondary"} className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {unallocatedCount} por alocar
          </Badge>
          <span className="text-muted-foreground">Transações sem L3 ou sem categoria.</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Sem categoria */}
              {txsByL2.noCat.length > 0 && (
                <section className="glass rounded-lg p-4 border border-destructive/40">
                  <h3 className="text-sm font-semibold mb-3">Sem categoria ({txsByL2.noCat.length})</h3>
                  <TxTable
                    txs={txsByL2.noCat}
                    effCat={effCat}
                    catLabel={catLabel}
                    onChange={handleChange}
                    options={/* all L3s */
                      l2s
                        .slice()
                        .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
                        .flatMap((l2) => [{ groupLabel: catLabel(l2.id) }, ...(l3sByL2.get(l2.id) ?? [])])
                    }
                  />
                </section>
              )}

              {/* Cada L2 */}
              {l2Sorted.map((l2) => {
                const l3List = l3sByL2.get(l2.id) ?? [];
                const previstoL2 = l3List.reduce((s, c) => s + (previstoByCat.get(c.id) ?? 0), 0) + (previstoByCat.get(l2.id) ?? 0);
                const realizadoL2 = (txsByL2.byL2.get(l2.id) ?? []).reduce((s, t) => s + withIva(t.amount, t.iva_rate), 0);
                const list = txsByL2.byL2.get(l2.id) ?? [];
                // "Por alocar" dentro do L2: transações cuja effCat é este L2 (não L3)
                const porAlocar = list.filter((t) => effCat(t) === l2.id);
                const alocadas = list.filter((t) => effCat(t) !== l2.id);

                return (
                  <section key={l2.id} className="glass rounded-lg p-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <h3 className="text-sm font-semibold">{l2.code} — {l2.name}</h3>
                      <div className="text-xs text-muted-foreground">
                        Previsto L2: <span className="font-mono">{formatCurrency(previstoL2)}</span> · Realizado L2: <span className="font-mono">{formatCurrency(realizadoL2)}</span>
                      </div>
                    </div>

                    {/* Painel L3 */}
                    <div className="mb-3 rounded-md border border-border/60 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">L3</th>
                            <th className="text-right px-3 py-1.5 font-medium">Previsto c/IVA</th>
                            <th className="text-right px-3 py-1.5 font-medium">Realizado c/IVA</th>
                            <th className="text-right px-3 py-1.5 font-medium">Diferença</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {l3List.map((l3) => {
                            const prev = previstoByCat.get(l3.id) ?? 0;
                            const real = realizedByL3.get(l3.id) ?? 0;
                            const diff = prev - real;
                            const over = real > prev && prev > 0;
                            return (
                              <tr key={l3.id}>
                                <td className="px-3 py-1.5">{l3.code} {l3.name}</td>
                                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(prev)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono ${over ? "text-destructive" : ""}`}>{formatCurrency(real)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono ${diff < 0 ? "text-destructive" : "text-emerald-500"}`}>{formatCurrency(diff)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {porAlocar.length > 0 && (
                      <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                        <p className="text-xs font-semibold text-amber-500 mb-2">Por alocar dentro deste L2 ({porAlocar.length})</p>
                        <TxTable
                          txs={porAlocar}
                          effCat={effCat}
                          catLabel={catLabel}
                          onChange={handleChange}
                          options={l3List}
                        />
                      </div>
                    )}

                    {alocadas.length > 0 && (
                      <TxTable
                        txs={alocadas}
                        effCat={effCat}
                        catLabel={catLabel}
                        onChange={handleChange}
                        options={l3List}
                      />
                    )}

                    {list.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Sem transações neste L2.</p>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TxTableProps {
  txs: Tx[];
  effCat: (t: Tx) => string | null | undefined;
  catLabel: (id: string | null | undefined) => string;
  onChange: (t: Tx, newCatId: string) => void;
  options: Array<Cat | { groupLabel: string }>;
}

function TxTable({ txs, effCat, catLabel, onChange, options }: TxTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border/40">
            <th className="text-left px-2 py-1.5 font-medium">Data</th>
            <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
            <th className="text-right px-2 py-1.5 font-medium">Valor c/IVA</th>
            <th className="text-left px-2 py-1.5 font-medium">Estado</th>
            <th className="text-left px-2 py-1.5 font-medium min-w-[220px]">Categoria L3</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {txs.map((t) => {
            const cur = effCat(t) ?? "";
            const total = withIva(t.amount, t.iva_rate);
            return (
              <tr key={t.id}>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-2 py-1.5">{t.description || "—"}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(total)}</td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider">{t.status || "—"}</span>
                </td>
                <td className="px-2 py-1.5">
                  <Select value={cur || undefined} onValueChange={(v) => onChange(t, v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Escolher L3…">{cur ? catLabel(cur) : "Escolher L3…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {options.map((opt, i) => {
                        if ("groupLabel" in opt) {
                          return (
                            <div key={`g-${i}`} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                              {opt.groupLabel}
                            </div>
                          );
                        }
                        return (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.code} {opt.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
