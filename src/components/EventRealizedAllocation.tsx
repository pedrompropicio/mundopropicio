import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Loader2, AlertTriangle, Sparkles, Link2, Link2Off, Tag, Wand2, Check, X } from "lucide-react";

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

// ─────────── Matching helpers (sugeridor de vínculos) ───────────
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "para", "por", "com", "sem", "em", "no", "na", "-", "&"]);

function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(s: string | null | undefined): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}
function jaccard(a: string[], b: string[]): { score: number; common: string[] } {
  if (a.length === 0 || b.length === 0) return { score: 0, common: [] };
  const sa = new Set(a);
  const sb = new Set(b);
  const common: string[] = [];
  for (const t of sa) if (sb.has(t)) common.push(t);
  const uni = new Set([...sa, ...sb]).size;
  return { score: uni === 0 ? 0 : common.length / uni, common };
}

interface Suggestion {
  tx: Tx;
  forecast: Forecast;
  score: number;
  common: string[];
  sameL3: boolean;
  fitsAmount: boolean;
}


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

  // ─── Sugeridor de vínculos: gera pares (tx sem linha, forecast livre) do mesmo L2 ───
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [processing, setProcessing] = useState(false);

  const buildSuggestions = () => {
    const THRESHOLD = 0.25;
    const candidateTxs = txs.filter((t) => !forecastByTxId.has(t.id));
    const freeForecasts = forecasts.filter(
      (f) => !f.transaction_id && f.category_id && levelOf(f.category_id) === 3,
    );

    type Pair = Suggestion & { raw: number };
    const pairs: Pair[] = [];
    for (const t of candidateTxs) {
      const tl2 = l2Of(t.category_id);
      const tTokens = tokenize(t.description);
      if (tTokens.length === 0) continue;
      for (const f of freeForecasts) {
        const fl2 = l2Of(f.category_id);
        // Mesmo L2 obrigatório (se tx tem L2). Se tx não tem categoria, aceita qualquer.
        if (tl2 && fl2 && tl2 !== fl2) continue;
        if (tl2 && !fl2) continue;
        const fTokens = tokenize(`${f.description ?? ""} ${f.specification ?? ""}`);
        if (fTokens.length === 0) continue;
        const { score: jac, common } = jaccard(tTokens, fTokens);
        if (jac < THRESHOLD) continue;
        const sameL3 = !!t.category_id && t.category_id === f.category_id;
        const txTotal = withIva(t.amount, t.iva_rate);
        const fTotal = withIva(f.amount, f.iva_rate);
        const fitsAmount = fTotal > 0 && txTotal <= fTotal + 0.01;
        let score = jac;
        if (sameL3) score += 0.25;
        if (fitsAmount) score += 0.08;
        pairs.push({ tx: t, forecast: f, score, common, sameL3, fitsAmount, raw: jac });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const usedTx = new Set<string>();
    const usedF = new Set<string>();
    const picked: Suggestion[] = [];
    for (const p of pairs) {
      if (usedTx.has(p.tx.id) || usedF.has(p.forecast.id)) continue;
      usedTx.add(p.tx.id);
      usedF.add(p.forecast.id);
      picked.push({ tx: p.tx, forecast: p.forecast, score: p.score, common: p.common, sameL3: p.sameL3, fitsAmount: p.fitsAmount });
    }
    setSuggestions(picked);
    setSuggestOpen(true);
  };

  const acceptOne = async (s: Suggestion) => {
    try {
      await linkMut.mutateAsync({ tx: s.tx, targetForecastId: s.forecast.id });
      setSuggestions((prev) => prev.filter((x) => x.tx.id !== s.tx.id));
    } catch {
      /* toast handled by mutation */
    }
  };

  const acceptAll = async () => {
    setProcessing(true);
    const queue = [...suggestions];
    let ok = 0;
    let fail = 0;
    for (const s of queue) {
      try {
        await linkMut.mutateAsync({ tx: s.tx, targetForecastId: s.forecast.id });
        ok++;
        setSuggestions((prev) => prev.filter((x) => x.tx.id !== s.tx.id));
      } catch {
        fail++;
      }
    }
    setProcessing(false);
    toast({
      title: `Sugestões aplicadas: ${ok}${fail > 0 ? ` · ${fail} falharam` : ""}`,
    });
  };

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

  // Build options for a given L2. Each L3 rende como opção seleccionável ("só a rubrica"),
  // seguida das linhas BP dessa L3 (se existirem). L3s sem forecasts também aparecem.
  const optionsForL2 = (l2Id: string | null): BpOption[] => {
    const opts: BpOption[] = [];
    const l3List = l2Id
      ? (l3sByL2.get(l2Id) ?? [])
      : l2s
          .slice()
          .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
          .flatMap((l2) => l3sByL2.get(l2.id) ?? []);
    const allFcasts = l2Id ? (forecastsByL2.get(l2Id) ?? []) : forecasts;
    const byL3 = new Map<string, Forecast[]>();
    for (const f of allFcasts) {
      if (!f.category_id || levelOf(f.category_id) !== 3) continue;
      const arr = byL3.get(f.category_id) ?? [];
      arr.push(f);
      byL3.set(f.category_id, arr);
    }
    for (const l3 of l3List) {
      opts.push({ l3 });
      const arr = byL3.get(l3.id);
      if (!arr || arr.length === 0) continue;
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

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge variant={semRubricaCount > 0 ? "destructive" : "secondary"} className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {semRubricaCount} sem rubrica L3
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Link2Off className="h-3 w-3" /> {semLinhaCount} sem linha específica
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={buildSuggestions}
            disabled={isLoading || semLinhaCount === 0}
          >
            <Wand2 className="h-3.5 w-3.5" /> Sugerir vínculos
          </Button>
          <span className="text-muted-foreground">
            Sem rubrica é crítico; sem linha é informativo — pode ficar só na rubrica.
          </span>
        </div>

        {/* Sub-diálogo: revisão de sugestões */}
        <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" />
                Sugestões de vínculos ({suggestions.length})
              </DialogTitle>
              <DialogDescription>
                Pares (transação → linha BP livre) do mesmo L2, ordenados por afinidade textual.
                Nada é gravado sem confirmação explícita.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {suggestions.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  Sem sugestões acima do limiar. Faz alocação manual nos casos restantes.
                </div>
              ) : (
                suggestions.map((s) => {
                  const txTotal = withIva(s.tx.amount, s.tx.iva_rate);
                  const fTotal = withIva(s.forecast.amount, s.forecast.iva_rate);
                  return (
                    <div
                      key={s.tx.id}
                      className="rounded-md border border-border/60 p-3 text-xs flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Transação</span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(s.tx.date)}</span>
                        </div>
                        <div className="font-medium truncate">{s.tx.description || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {catLabel(s.tx.category_id)} · <span className="font-mono">{formatCurrency(txTotal)}</span>
                        </div>
                      </div>
                      <div className="text-muted-foreground pt-4">→</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Linha BP livre</span>
                          {s.sameL3 && <Badge variant="secondary" className="h-4 text-[9px] px-1">mesma L3</Badge>}
                          {s.fitsAmount && <Badge variant="outline" className="h-4 text-[9px] px-1">cabe no previsto</Badge>}
                        </div>
                        <div className="font-medium truncate">
                          {s.forecast.description || "(sem descrição)"}
                          {s.forecast.specification ? ` · ${s.forecast.specification}` : ""}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {catLabel(s.forecast.category_id)} · Previsto <span className="font-mono">{formatCurrency(fTotal)}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Palavras comuns: <span className="italic">{s.common.join(", ") || "—"}</span> · score {(s.score * 100).toFixed(0)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => acceptOne(s)}
                          disabled={processing || linkMut.isPending}
                        >
                          <Check className="h-3 w-3" /> Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1"
                          onClick={() => setSuggestions((prev) => prev.filter((x) => x.tx.id !== s.tx.id))}
                          disabled={processing}
                        >
                          <X className="h-3 w-3" /> Descartar
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setSuggestOpen(false)} disabled={processing}>
                Fechar
              </Button>
              <Button
                onClick={acceptAll}
                disabled={suggestions.length === 0 || processing || linkMut.isPending}
                className="gap-1"
              >
                {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Aceitar todas ({suggestions.length})
              </Button>
            </div>
          </DialogContent>
        </Dialog>


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
                    onChange={(tx, arg) => linkMut.mutate({ tx, ...arg })}
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
                          onChange={(tx, arg) => linkMut.mutate({ tx, ...arg })}
                          options={opts}
                        />
                      </div>
                    )}

                    {comVinculo.length > 0 && (
                      <TxTable
                        txs={comVinculo}
                        forecastByTxId={forecastByTxId}
                        catLabel={catLabel}
                        onChange={(tx, arg) => linkMut.mutate({ tx, ...arg })}
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

type BpOption = { l3: Cat } | { forecast: Forecast };

interface TxTableProps {
  txs: Tx[];
  forecastByTxId: Map<string, Forecast>;
  catLabel: (id: string | null | undefined) => string;
  onChange: (t: Tx, arg: { targetForecastId?: string | null; targetL3Id?: string }) => void;
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
            <th className="text-left px-2 py-1.5 font-medium min-w-[320px]">Linha BP / Rubrica</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {txs.map((t) => {
            const linked = forecastByTxId.get(t.id);
            const total = withIva(t.amount, t.iva_rate);
            // Estados: linked (linha específica) / rubric-only (tem L3 mas sem linked) / vazio
            const hasL3 = !!t.category_id;
            const value = linked ? linked.id : hasL3 && !linked ? `${L3_PREFIX}${t.category_id}` : undefined;
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
                      value={value}
                      onValueChange={(v) => {
                        if (v === UNLINK_VALUE) onChange(t, { targetForecastId: null });
                        else if (v.startsWith(L3_PREFIX)) onChange(t, { targetL3Id: v.slice(L3_PREFIX.length) });
                        else onChange(t, { targetForecastId: v });
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
                        ) : hasL3 ? (
                          <span className="flex items-center gap-1 truncate text-muted-foreground">
                            <Tag className="h-3 w-3 shrink-0" />
                            <span className="truncate">{catLabel(t.category_id)} · só rubrica</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Escolher rubrica ou linha BP…</span>
                        )}
                      </SelectTrigger>
                      <SelectContent className="max-h-[360px] w-[560px]">
                        {(linked || hasL3) && (
                          <SelectItem value={UNLINK_VALUE}>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Link2Off className="h-3 w-3" /> Desvincular {linked ? "linha" : ""}
                            </span>
                          </SelectItem>
                        )}
                        {options.length === 0 && (
                          <div className="px-2 py-2 text-[11px] text-muted-foreground italic">Sem rubricas neste L2.</div>
                        )}
                        {options.map((opt, i) => {
                          if ("l3" in opt) {
                            const l3 = opt.l3;
                            return (
                              <SelectItem key={`l3-${l3.id}`} value={`${L3_PREFIX}${l3.id}`}>
                                <span className="flex items-center gap-1">
                                  <Tag className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">
                                    {l3.code} {l3.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">— só a rubrica</span>
                                </span>
                              </SelectItem>
                            );
                          }
                          const f = opt.forecast;
                          const busy = !!f.transaction_id && f.transaction_id !== t.id;
                          const prev = withIva(f.amount, f.iva_rate);
                          return (
                            <SelectItem key={f.id} value={f.id} disabled={busy} className="pl-6">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Link2 className="h-3 w-3 text-emerald-500 shrink-0" />
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
                                <div className="text-[10px] text-muted-foreground pl-5">
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
