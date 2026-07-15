import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Loader2, AlertTriangle, Sparkles, Link2, Link2Off, Tag } from "lucide-react";

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
  description: string | null;
  specification: string | null;
  transaction_id: string | null;
  status: string | null;
}

const UNLINK_VALUE = "__unlink__";
const L3_PREFIX = "l3:";

const withIva = (amount: number, iva: number | null | undefined) =>
  Number(amount || 0) * (1 + Number(iva || 0) / 100);

export function EventRealizedAllocation({ open, onOpenChange, eventId, eventName }: Props) {
  const qc = useQueryClient();

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

  const { data: forecasts = [], isLoading: loadingF, refetch: refetchF } = useQuery({
    queryKey: ["ra_forecasts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, category_id, amount, iva_rate, description, specification, transaction_id, status")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .is("version_id", null)
        .in("status", ["approved", "draft"]);
      if (error) throw error;
      return (data ?? []) as Forecast[];
    },
    enabled: open,
  });

  const { data: txs = [], isLoading: loadingT, refetch: refetchT } = useQuery({
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

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

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

  const l2s = useMemo(
    () => cats.filter((c) => c.parent_id && byId.get(c.parent_id!) && !byId.get(c.parent_id!)!.parent_id),
    [cats, byId],
  );
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

  // Forecasts grouped by L2 → L3 (only forecasts that live at L3)
  const forecastsByL2 = useMemo(() => {
    const map = new Map<string, Forecast[]>();
    for (const f of forecasts) {
      const l2 = l2Of(f.category_id);
      if (!l2) continue;
      const arr = map.get(l2) ?? [];
      arr.push(f);
      map.set(l2, arr);
    }
    return map;
  }, [forecasts, byId]);

  // Map tx.id -> forecast (linked_direct)
  const forecastByTxId = useMemo(() => {
    const m = new Map<string, Forecast>();
    for (const f of forecasts) {
      if (f.transaction_id) m.set(f.transaction_id, f);
    }
    return m;
  }, [forecasts]);

  // targetForecastId: string (forecast.id) = link to specific BP line
  // targetForecastId: null = unlink (keep category)
  // targetL3Id: string = rubric-only allocation (set category to L3, unlink any existing FK)
  const linkMut = useMutation({
    mutationFn: async ({
      tx,
      targetForecastId,
      targetL3Id,
    }: {
      tx: Tx;
      targetForecastId?: string | null;
      targetL3Id?: string;
    }) => {
      const currentLinked = forecastByTxId.get(tx.id);

      // Case A: rubric-only — set tx.category_id to L3, unlink any existing forecast link
      if (targetL3Id) {
        // 1) unlink first (trigger valida L2 no UPDATE de tx.category_id se ainda houver FK)
        if (currentLinked) {
          const { error: eu } = await supabase
            .from("event_forecasts")
            .update({ transaction_id: null } as any)
            .eq("id", currentLinked.id);
          if (eu) throw eu;
        }
        // 2) update category_id
        if (tx.category_id !== targetL3Id) {
          const { error: ec } = await supabase
            .from("transactions")
            .update({ category_id: targetL3Id })
            .eq("id", tx.id);
          if (ec) throw ec;
        }
        return { rubricOnly: true };
      }

      // Case B: unlink
      if (targetForecastId === null) {
        if (!currentLinked) return { unlinked: true };
        const { error } = await supabase
          .from("event_forecasts")
          .update({ transaction_id: null } as any)
          .eq("id", currentLinked.id);
        if (error) throw error;
        return { unlinked: true };
      }

      // Case C: link (or re-link) to a specific BP line
      const target = forecasts.find((f) => f.id === targetForecastId);
      if (!target) throw new Error("Linha BP não encontrada");
      if (target.transaction_id && target.transaction_id !== tx.id) {
        throw new Error("Esta linha BP já tem outra transação vinculada. Desvincula-a primeiro na edição da transação atual dessa linha.");
      }

      if (currentLinked && currentLinked.id !== target.id) {
        const { error: eu } = await supabase
          .from("event_forecasts")
          .update({ transaction_id: null } as any)
          .eq("id", currentLinked.id);
        if (eu) throw eu;
      }

      if (target.category_id && target.category_id !== tx.category_id) {
        const { error: ec } = await supabase
          .from("transactions")
          .update({ category_id: target.category_id })
          .eq("id", tx.id);
        if (ec) throw ec;
      }

      const { error: ef, data: updated } = await supabase
        .from("event_forecasts")
        .update({ transaction_id: tx.id } as any)
        .eq("id", target.id)
        .is("transaction_id", null)
        .select("id");
      if (ef) throw ef;
      if (!updated || updated.length === 0) {
        throw new Error("A linha BP ficou vinculada a outra transação entretanto. Atualiza e tenta de novo.");
      }
      return { linked: true };
    },
    onSuccess: (r: any) => {
      toast({
        title: r?.rubricOnly
          ? "Transação alocada só à rubrica L3"
          : r?.unlinked
            ? "Transação desvinculada"
            : "Transação vinculada à linha BP",
      });
      qc.invalidateQueries({ queryKey: ["ra_txs", eventId] });
      qc.invalidateQueries({ queryKey: ["ra_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["partner_realized", eventId] });
      refetchT();
      refetchF();
    },
    onError: (e: any) => toast({ title: "Não foi possível alocar", description: e.message, variant: "destructive" }),
  });

  // Group txs by L2 (using their current category)
  const txsByL2 = useMemo(() => {
    const m = new Map<string, Tx[]>();
    const noCat: Tx[] = [];
    for (const t of txs) {
      const l2 = l2Of(t.category_id);
      if (!t.category_id || !l2) {
        noCat.push(t);
      } else {
        const arr = m.get(l2) ?? [];
        arr.push(t);
        m.set(l2, arr);
      }
    }
    return { byL2: m, noCat };
  }, [txs, byId]);

  // Realizado by L3 (c/IVA) — usa a category_id atual da tx.
  const realizedByL3 = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) {
      if (!t.category_id) continue;
      m.set(t.category_id, (m.get(t.category_id) ?? 0) + withIva(t.amount, t.iva_rate));
    }
    return m;
  }, [txs]);

  const previstoByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of forecasts) {
      if (!f.category_id) continue;
      m.set(f.category_id, (m.get(f.category_id) ?? 0) + withIva(f.amount, f.iva_rate));
    }
    return m;
  }, [forecasts]);

  const activeL2Ids = useMemo(() => {
    const s = new Set<string>();
    for (const [cat] of previstoByCat) {
      const l2 = l2Of(cat);
      if (l2) s.add(l2);
    }
    for (const t of txs) {
      const l2 = l2Of(t.category_id);
      if (l2) s.add(l2);
    }
    return s;
  }, [previstoByCat, txs, byId]);

  // Critical: TX sem rubrica L3 (categoria vazia ou não-L3)
  const semRubricaCount = useMemo(
    () => txs.filter((t) => levelOf(t.category_id) !== 3).length,
    [txs, byId],
  );
  // Informative: TX sem linha específica (independente da rubrica)
  const semLinhaCount = useMemo(
    () => txs.filter((t) => !forecastByTxId.has(t.id)).length,
    [txs, forecastByTxId],
  );

  const isLoading = loadingCats || loadingF || loadingT;

  const catLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const c = byId.get(id);
    return c ? `${c.code ?? ""} ${c.name}`.trim() : "—";
  };

  const l2Sorted = useMemo(
    () =>
      Array.from(activeL2Ids)
        .map((id) => byId.get(id)!)
        .filter(Boolean)
        .sort((a, b) => (a.code || "").localeCompare(b.code || "")),
    [activeL2Ids, byId],
  );

  // Build options for a given L2: [{group: L3 label}, ...forecasts of that L3]
  const optionsForL2 = (l2Id: string | null): BpOption[] => {
    const opts: BpOption[] = [];
    const l3List = l2Id ? (l3sByL2.get(l2Id) ?? []) : l2s.slice().sort((a, b) => (a.code || "").localeCompare(b.code || "")).flatMap((l2) => l3sByL2.get(l2.id) ?? []);
    const allFcasts = l2Id ? (forecastsByL2.get(l2Id) ?? []) : forecasts;
    // Group by L3 category_id
    const byL3 = new Map<string, Forecast[]>();
    for (const f of allFcasts) {
      if (!f.category_id || levelOf(f.category_id) !== 3) continue;
      const arr = byL3.get(f.category_id) ?? [];
      arr.push(f);
      byL3.set(f.category_id, arr);
    }
    for (const l3 of l3List) {
      const arr = byL3.get(l3.id);
      if (!arr || arr.length === 0) continue;
      opts.push({ groupLabel: `${l3.code ?? ""} ${l3.name}`.trim() });
      arr.sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
      for (const f of arr) opts.push({ forecast: f });
    }
    return opts;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Alocação do Realizado {eventName ? `— ${eventName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Vincula cada transação à <strong>linha de despesa</strong> do BP a que corresponde. O vínculo é <code>event_forecasts.transaction_id</code> — mesmo mecanismo do modal de criação. Alinha automaticamente o L3 da transação com a linha escolhida.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 text-xs">
          <Badge variant={unallocatedCount > 0 ? "destructive" : "secondary"} className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {unallocatedCount} por alocar
          </Badge>
          <span className="text-muted-foreground">Transações sem vínculo a linha BP.</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {txsByL2.noCat.length > 0 && (
                <section className="glass rounded-lg p-4 border border-destructive/40">
                  <h3 className="text-sm font-semibold mb-3">Sem categoria / L1 ({txsByL2.noCat.length})</h3>
                  <TxTable
                    txs={txsByL2.noCat}
                    forecastByTxId={forecastByTxId}
                    catLabel={catLabel}
                    onChange={(tx, id) => linkMut.mutate({ tx, targetForecastId: id })}
                    options={optionsForL2(null)}
                  />
                </section>
              )}

              {l2Sorted.map((l2) => {
                const l3List = l3sByL2.get(l2.id) ?? [];
                const previstoL2 =
                  l3List.reduce((s, c) => s + (previstoByCat.get(c.id) ?? 0), 0) +
                  (previstoByCat.get(l2.id) ?? 0);
                const list = txsByL2.byL2.get(l2.id) ?? [];
                const realizadoL2 = list.reduce((s, t) => s + withIva(t.amount, t.iva_rate), 0);
                const semVinculo = list.filter((t) => !forecastByTxId.has(t.id));
                const comVinculo = list.filter((t) => forecastByTxId.has(t.id));
                const opts = optionsForL2(l2.id);

                return (
                  <section key={l2.id} className="glass rounded-lg p-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <h3 className="text-sm font-semibold">
                        {l2.code} — {l2.name}
                      </h3>
                      <div className="text-xs text-muted-foreground">
                        Previsto L2: <span className="font-mono">{formatCurrency(previstoL2)}</span> · Realizado L2: <span className="font-mono">{formatCurrency(realizadoL2)}</span>
                      </div>
                    </div>

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
                                <td className="px-3 py-1.5">
                                  {l3.code} {l3.name}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(prev)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono ${over ? "text-destructive" : ""}`}>
                                  {formatCurrency(real)}
                                </td>
                                <td className={`px-3 py-1.5 text-right font-mono ${diff < 0 ? "text-destructive" : "text-emerald-500"}`}>
                                  {formatCurrency(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {semVinculo.length > 0 && (
                      <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                        <p className="text-xs font-semibold text-amber-500 mb-2">
                          Sem vínculo a linha BP ({semVinculo.length})
                        </p>
                        <TxTable
                          txs={semVinculo}
                          forecastByTxId={forecastByTxId}
                          catLabel={catLabel}
                          onChange={(tx, id) => linkMut.mutate({ tx, targetForecastId: id })}
                          options={opts}
                        />
                      </div>
                    )}

                    {comVinculo.length > 0 && (
                      <TxTable
                        txs={comVinculo}
                        forecastByTxId={forecastByTxId}
                        catLabel={catLabel}
                        onChange={(tx, id) => linkMut.mutate({ tx, targetForecastId: id })}
                        options={opts}
                      />
                    )}

                    {list.length === 0 && <p className="text-xs text-muted-foreground italic">Sem transações neste L2.</p>}
                  </section>
                );
              })}
            </>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BpOption = { groupLabel: string } | { forecast: Forecast };

interface TxTableProps {
  txs: Tx[];
  forecastByTxId: Map<string, Forecast>;
  catLabel: (id: string | null | undefined) => string;
  onChange: (t: Tx, targetForecastId: string | null) => void;
  options: BpOption[];
}

function TxTable({ txs, forecastByTxId, catLabel, onChange, options }: TxTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border/40">
            <th className="text-left px-2 py-1.5 font-medium">Data</th>
            <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
            <th className="text-right px-2 py-1.5 font-medium">Valor c/IVA</th>
            <th className="text-left px-2 py-1.5 font-medium">Estado</th>
            <th className="text-left px-2 py-1.5 font-medium min-w-[320px]">Linha BP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {txs.map((t) => {
            const linked = forecastByTxId.get(t.id);
            const total = withIva(t.amount, t.iva_rate);
            const value = linked?.id ?? "";
            return (
              <tr key={t.id}>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-2 py-1.5">
                  <div>{t.description || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{catLabel(t.category_id)}</div>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(total)}</td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider">{t.status || "—"}</span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <Select
                      value={value || undefined}
                      onValueChange={(v) => {
                        if (v === UNLINK_VALUE) onChange(t, null);
                        else onChange(t, v);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        {linked ? (
                          <span className="flex items-center gap-1 truncate">
                            <Link2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span className="truncate">
                              {linked.description || catLabel(linked.category_id)}
                              {linked.specification ? ` · ${linked.specification}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Escolher linha BP…</span>
                        )}
                      </SelectTrigger>
                      <SelectContent className="max-h-[360px] w-[520px]">
                        {linked && (
                          <SelectItem value={UNLINK_VALUE}>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Link2Off className="h-3 w-3" /> Desvincular
                            </span>
                          </SelectItem>
                        )}
                        {options.length === 0 && (
                          <div className="px-2 py-2 text-[11px] text-muted-foreground italic">Sem linhas BP neste L2.</div>
                        )}
                        {options.map((opt, i) => {
                          if ("groupLabel" in opt) {
                            return (
                              <div
                                key={`g-${i}`}
                                className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30"
                              >
                                {opt.groupLabel}
                              </div>
                            );
                          }
                          const f = opt.forecast;
                          const busy = !!f.transaction_id && f.transaction_id !== t.id;
                          const prev = withIva(f.amount, f.iva_rate);
                          return (
                            <SelectItem key={f.id} value={f.id} disabled={busy}>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{f.description || "(sem descrição)"}</span>
                                  {busy && (
                                    <Badge variant="outline" className="h-4 text-[9px] px-1">
                                      já vinculada
                                    </Badge>
                                  )}
                                  {!f.transaction_id && (
                                    <Badge variant="secondary" className="h-4 text-[9px] px-1">
                                      SEM TX
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {f.specification ? `${f.specification} · ` : ""}
                                  Previsto {formatCurrency(prev)}
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
