/**
 * D17/D18 — assistente de fecho da sessão de cartão.
 *
 * Passo 1  Resumo: grupos evento × rubrica × IVA dos itens, os sem evento à
 *          parte, e os pares vindos das transações directas antigas da sessão.
 *          Itens `submitted` bloqueiam — cada um leva decisão (parked_decisions).
 * Passo 2  Linha de BP por par (evento `with_bp` × rubrica), com LinkBpLineDialog
 *          em `pickOnly` (escolhe ou cria a linha na L3). Pré-seleccionada quando
 *          a rubrica só tem uma linha.
 * Passo 3  Conciliação do saldo (teórico vs conferido, ajuste opcional).
 * Passo 4  Chama `close-card-session`: 422 `missing_bp_lines` volta ao passo 2;
 *          422 `budget_excess` abre o RaiseBudgetDialog multi-linha (D2) e repete
 *          com `budget_raises`.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Lock, Loader2, ArrowRight, ArrowLeft, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, invalidateCardSessionQueries, cardItemGross } from "@/lib/card-session-helpers";
import { fetchWithBpEventIds } from "@/lib/bp-line-required";
import LinkBpLineDialog from "@/components/LinkBpLineDialog";
import RaiseBudgetDialog from "@/components/RaiseBudgetDialog";
import type { BudgetExcessLine, BudgetRaise } from "@/lib/bp-budget-excess";

interface SessionData {
  id: string;
  card_account_id: string;
  card_name: string;
  opening_balance: number;
  total_loads: number;
  total_approved_expenses: number;
  pending_items: number;
  expenses_by_event: Record<string, { name: string; amount: number }>;
  opening_is_override?: boolean;
  direct_total?: number;
  direct_movements?: { id: string; description: string; signed: number; date: string }[];
  account_balance?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionData;
}

type ParkedDecision = { decision: "reject" | "approve_without_doc" | "defer"; reason: string };

interface PairKey {
  event_id: string;
  category_id: string;
}

export function CloseCardSessionModal({ open, onOpenChange, session }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [parked, setParked] = useState<Record<string, ParkedDecision>>({});
  const [lineByPair, setLineByPair] = useState<Record<string, string>>({});
  const [pickPair, setPickPair] = useState<null | {
    event_id: string;
    category_id: string;
    eventName: string;
    code: string;
    name: string;
    amount: number;
  }>(null);
  const [raiseLines, setRaiseLines] = useState<BudgetExcessLine[] | null>(null);
  const [confirmedBalance, setConfirmedBalance] = useState("");
  const [createAdjustment, setCreateAdjustment] = useState(false);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setRaiseLines(null);
      setRunning(false);
    }
  }, [open]);

  // ===== Dados da sessão =====
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["card-close-wizard", session.id],
    enabled: open,
    queryFn: async () => {
      const [{ data: items }, { data: legacy }] = await Promise.all([
        supabase
          .from("card_session_items")
          .select("id, description, supplier_name, amount, iva_rate, item_date, event_id, category_id, status, transaction_id, approved_without_document")
          .eq("session_id", session.id)
          .in("status", ["submitted", "approved"]),
        supabase
          .from("transactions")
          .select("id, description, amount, paid_amount, iva_rate, event_id, category_id, forecast_id, date, type")
          .eq("card_session_id", session.id),
      ]);
      const itemRows = (items ?? []) as any[];
      const itemTxIds = new Set(itemRows.map((i) => i.transaction_id).filter(Boolean));
      const legacyRows = ((legacy ?? []) as any[]).filter(
        (t) => !itemTxIds.has(t.id) && t.type === "expense",
      );

      const eventIds = [
        ...new Set([
          ...itemRows.map((i) => i.event_id),
          ...legacyRows.map((t) => t.event_id),
        ].filter(Boolean) as string[]),
      ];
      const categoryIds = [
        ...new Set([
          ...itemRows.map((i) => i.category_id),
          ...legacyRows.map((t) => t.category_id),
        ].filter(Boolean) as string[]),
      ];
      const [{ data: evs }, { data: cats }] = await Promise.all([
        eventIds.length
          ? supabase.from("events").select("id, name").in("id", eventIds)
          : Promise.resolve({ data: [] as any[] } as any),
        categoryIds.length
          ? supabase.from("account_categories").select("id, code, name").in("id", categoryIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const withBp = eventIds.length ? await fetchWithBpEventIds(eventIds) : new Set<string>();

      return {
        items: itemRows,
        legacy: legacyRows,
        eventById: new Map(((evs ?? []) as any[]).map((e) => [e.id, e])),
        catById: new Map(((cats ?? []) as any[]).map((c) => [c.id, c])),
        withBp,
      };
    },
  });

  const items = data?.items ?? [];
  const legacy = data?.legacy ?? [];
  const submittedItems = items.filter((i: any) => i.status === "submitted");
  const approvedItems = items.filter((i: any) => i.status === "approved");

  const evName = (id?: string | null) =>
    id ? ((data?.eventById.get(id) as any)?.name ?? "—") : "Sem evento (estrutura)";
  const catLabel = (id?: string | null) => {
    const c = id ? (data?.catById.get(id) as any) : null;
    return c ? `${c.code} — ${c.name}` : "sem rubrica";
  };

  // ===== Grupos evento × rubrica × IVA (itens aprovados) =====
  const groups = useMemo(() => {
    const map = new Map<string, { event_id: string | null; category_id: string | null; iva_rate: number; count: number; base: number; total: number }>();
    for (const it of approvedItems as any[]) {
      const key = [it.event_id ?? "", it.category_id ?? "", Number(it.iva_rate ?? 0)].join("|");
      const cur = map.get(key) ?? {
        event_id: it.event_id ?? null,
        category_id: it.category_id ?? null,
        iva_rate: Number(it.iva_rate ?? 0),
        count: 0,
        base: 0,
        total: 0,
      };
      cur.count += 1;
      cur.base += Number(it.amount ?? 0);
      cur.total += cardItemGross(it);
      map.set(key, cur);
    }
    return [...map.values()];
  }, [approvedItems]);

  /** Pares (evento with_bp × rubrica) que exigem linha — itens + antigas (D18). */
  const pairs = useMemo(() => {
    const map = new Map<string, PairKey & { item_count: number; item_base: number; legacy_count: number; legacy_total: number }>();
    const add = (eventId: string, categoryId: string, isLegacy: boolean, base: number) => {
      const key = `${eventId}|${categoryId}`;
      const cur = map.get(key) ?? {
        event_id: eventId,
        category_id: categoryId,
        item_count: 0,
        item_base: 0,
        legacy_count: 0,
        legacy_total: 0,
      };
      if (isLegacy) {
        cur.legacy_count += 1;
        cur.legacy_total += base;
      } else {
        cur.item_count += 1;
        cur.item_base += base;
      }
      map.set(key, cur);
    };
    for (const it of approvedItems as any[]) {
      if (!it.event_id || !it.category_id) continue;
      if (!data?.withBp.has(it.event_id)) continue;
      add(it.event_id, it.category_id, false, Number(it.amount ?? 0));
    }
    for (const t of legacy as any[]) {
      if (!t.event_id || !t.category_id || t.forecast_id) continue;
      if (!data?.withBp.has(t.event_id)) continue;
      add(t.event_id, t.category_id, true, Number(t.amount ?? 0));
    }
    return [...map.values()];
  }, [approvedItems, legacy, data?.withBp]);

  // Pré-selecção: rubrica com uma única linha no evento.
  useEffect(() => {
    if (!open || pairs.length === 0) return;
    void (async () => {
      const next: Record<string, string> = {};
      for (const p of pairs) {
        const key = `${p.event_id}|${p.category_id}`;
        if (lineByPair[key]) continue;
        const { data: lines } = await supabase
          .from("event_forecasts")
          .select("id")
          .eq("event_id", p.event_id)
          .eq("category_id", p.category_id)
          .eq("type", "expense")
          .is("version_id", null);
        if ((lines ?? []).length === 1) next[key] = (lines as any[])[0].id;
      }
      if (Object.keys(next).length > 0) setLineByPair((prev) => ({ ...next, ...prev }));
    })();
  }, [open, pairs.length]);

  // ===== Conciliação =====
  const directTotal = Number(session.direct_total ?? 0);
  const directMovements = session.direct_movements ?? [];
  const legacySpend = useMemo(
    () => legacy.reduce((s: number, t: any) => s - Number(t.paid_amount ?? 0), 0),
    [legacy],
  );
  const newSpendGross = useMemo(
    () => (approvedItems as any[]).reduce((s, it) => s + cardItemGross(it), 0),
    [approvedItems],
  );
  const theoretical = useMemo(
    () =>
      Math.round(
        (session.opening_balance + session.total_loads - newSpendGross + legacySpend + directTotal) * 100,
      ) / 100,
    [session.opening_balance, session.total_loads, newSpendGross, legacySpend, directTotal],
  );

  useEffect(() => {
    if (open) setConfirmedBalance(theoretical.toFixed(2));
  }, [open, theoretical]);

  const diff = Math.round((parseFloat(confirmedBalance || "0") - theoretical) * 100) / 100;
  const noteRequired = Math.abs(diff) > 0.01 && createAdjustment;

  const missingPairs = pairs.filter((p) => !lineByPair[`${p.event_id}|${p.category_id}`]);
  const undecided = submittedItems.filter((i: any) => !parked[i.id]);
  const badReason = submittedItems.filter(
    (i: any) => parked[i.id]?.decision === "approve_without_doc" && !parked[i.id]?.reason.trim(),
  );

  // ===== Execução =====
  const run = async (raises?: BudgetRaise[]) => {
    setRunning(true);
    try {
      const body = {
        session_id: session.id,
        parked_decisions: Object.entries(parked).map(([item_id, v]) => ({
          item_id,
          decision: v.decision,
          reason: v.reason || undefined,
        })),
        forecast_lines: pairs
          .map((p) => ({
            event_id: p.event_id,
            category_id: p.category_id,
            forecast_id: lineByPair[`${p.event_id}|${p.category_id}`],
          }))
          .filter((l) => !!l.forecast_id),
        budget_raises: raises ?? [],
        confirmed_balance: parseFloat(confirmedBalance),
        create_adjustment: createAdjustment,
        adjustment_note: note.trim() || null,
      };

      const { data: res, error } = await supabase.functions.invoke("close-card-session", { body });

      if (error) {
        let parsed: any = null;
        try {
          const ctx = (error as any)?.context;
          const text = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* ignora */
        }
        if (Array.isArray(parsed?.missing_bp_lines) && parsed.missing_bp_lines.length > 0) {
          toast({
            variant: "destructive",
            title: "Falta a linha de BP",
            description: "Escolhe a linha de cada par evento × rubrica.",
          });
          setStep(2);
          return;
        }
        if (Array.isArray(parsed?.budget_excess) && parsed.budget_excess.length > 0) {
          setRaiseLines(parsed.budget_excess as BudgetExcessLine[]);
          return;
        }
        if (Array.isArray(parsed?.parked_items) && parsed.parked_items.length > 0) {
          toast({ variant: "destructive", title: "Há despesas por rever", description: "Decide item a item." });
          setStep(1);
          void refetch();
          return;
        }
        throw new Error(parsed?.error ?? error.message);
      }
      if ((res as any)?.error) throw new Error((res as any).error);

      const created = (res as any)?.created ?? 0;
      toast({
        title: "Sessão fechada e integrada",
        description: `${created} transação(ões) consolidada(s)${
          (res as any)?.errors?.length ? ` · ${(res as any).errors.length} erro(s)` : ""
        }`,
      });
      invalidateCardSessionQueries(qc, session.id);
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao fechar", description: e.message });
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Fechar e integrar sessão de cartão</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 text-xs">
          {["Resumo", "Linhas de BP", "Saldo", "Integrar"].map((label, i) => (
            <div
              key={label}
              className={`flex-1 rounded-md border px-2 py-1 text-center ${
                step === i + 1
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {i + 1}. {label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> A carregar a sessão…
          </p>
        ) : (
          <>
            {/* ================= PASSO 1 ================= */}
            {step === 1 && (
              <div className="space-y-4">
                {submittedItems.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm font-semibold text-amber-600">
                      {submittedItems.length} despesa(s) por rever — decide antes de integrar
                    </p>
                    {submittedItems.map((it: any) => (
                      <div key={it.id} className="rounded border border-border/60 bg-background/60 p-2 text-xs">
                        <p className="font-medium">
                          {it.supplier_name || it.description || "—"} · {formatCurrency(cardItemGross(it))}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {(["reject", "approve_without_doc", "defer"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() =>
                                setParked((prev) => ({
                                  ...prev,
                                  [it.id]: { decision: d, reason: prev[it.id]?.reason ?? "" },
                                }))
                              }
                              className={`rounded border px-2 py-0.5 ${
                                parked[it.id]?.decision === d
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {d === "reject" ? "Rejeitar" : d === "approve_without_doc" ? "Aprovar sem doc." : "Adiar"}
                            </button>
                          ))}
                        </div>
                        {parked[it.id]?.decision === "approve_without_doc" && (
                          <input
                            className={`${inputCls} mt-2`}
                            placeholder="Justificação obrigatória"
                            value={parked[it.id]?.reason ?? ""}
                            onChange={(e) =>
                              setParked((prev) => ({
                                ...prev,
                                [it.id]: { decision: "approve_without_doc", reason: e.target.value },
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Consolidação por evento × rubrica × IVA</h3>
                  {groups.filter((g) => g.event_id).length === 0 && (
                    <p className="text-xs text-muted-foreground">Sem itens com evento.</p>
                  )}
                  <div className="space-y-1">
                    {groups
                      .filter((g) => g.event_id)
                      .map((g, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                          <span className="min-w-0 truncate">
                            {evName(g.event_id)} · {catLabel(g.category_id)} · IVA {g.iva_rate}%
                            <span className="text-muted-foreground"> ({g.count})</span>
                          </span>
                          <span className="font-medium tabular-nums">{formatCurrency(g.total)}</span>
                        </div>
                      ))}
                  </div>
                </section>

                {groups.some((g) => !g.event_id) && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Sem evento (estrutura — fora do BP)</h3>
                    <div className="space-y-1">
                      {groups
                        .filter((g) => !g.event_id)
                        .map((g, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                            <span className="min-w-0 truncate">
                              {catLabel(g.category_id)} · IVA {g.iva_rate}%
                              <span className="text-muted-foreground"> ({g.count})</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCurrency(g.total)}</span>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                {legacy.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">
                      Transações antigas da sessão{" "}
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600">
                        registadas antes do modelo de itens
                      </Badge>
                    </h3>
                    <div className="space-y-1">
                      {pairs
                        .filter((p) => p.legacy_count > 0)
                        .map((p) => (
                          <div key={`${p.event_id}|${p.category_id}`} className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs">
                            <span className="min-w-0 truncate">
                              {evName(p.event_id)} · {catLabel(p.category_id)}
                              <span className="text-muted-foreground"> ({p.legacy_count} a alocar)</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCurrency(p.legacy_total)}</span>
                          </div>
                        ))}
                      {pairs.filter((p) => p.legacy_count > 0).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Já todas alocadas a linha de BP (ou sem evento) — entram só na conciliação.
                        </p>
                      )}
                    </div>
                  </section>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button
                    disabled={undecided.length > 0 || badReason.length > 0}
                    onClick={() => setStep(pairs.length > 0 ? 2 : 3)}
                  >
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ================= PASSO 2 ================= */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Cada par evento × rubrica de um evento gerido com BP precisa de uma linha. As despesas
                  antigas da sessão são alocadas à mesma linha do par (D18).
                </p>
                {pairs.map((p) => {
                  const key = `${p.event_id}|${p.category_id}`;
                  const chosen = lineByPair[key];
                  const cat = data?.catById.get(p.category_id) as any;
                  return (
                    <div key={key} className="rounded-lg border border-border p-3 text-xs">
                      <p className="font-medium">{evName(p.event_id)}</p>
                      <p className="text-muted-foreground">{catLabel(p.category_id)}</p>
                      <p className="mt-1 text-muted-foreground">
                        Itens: {p.item_count} · {formatCurrency(p.item_base)} · Antigas a alocar: {p.legacy_count} ·{" "}
                        {formatCurrency(p.legacy_total)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {chosen ? (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Linha escolhida
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Sem linha
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPickPair({
                              event_id: p.event_id,
                              category_id: p.category_id,
                              eventName: evName(p.event_id),
                              code: cat?.code ?? "",
                              name: cat?.name ?? "",
                              amount: p.item_base + p.legacy_total,
                            })
                          }
                        >
                          <Link2 className="mr-2 h-3 w-3" /> {chosen ? "Trocar linha" : "Escolher linha"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                  </Button>
                  <Button disabled={missingPairs.length > 0} onClick={() => setStep(3)}>
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ================= PASSO 3 ================= */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                  <Row
                    label={`Saldo abertura${session.opening_is_override ? " (override)" : " (calculado da conta)"}`}
                    value={formatCurrency(session.opening_balance)}
                  />
                  <Row label="Recargas" value={formatCurrency(session.total_loads)} />
                  <Row label="Despesas da sessão (itens)" value={`− ${formatCurrency(newSpendGross)}`} />
                  <Row label="Transações antigas da sessão" value={formatCurrency(legacySpend)} />
                  <Row
                    label={`Movimentos diretos na conta (${directMovements.length})`}
                    value={formatCurrency(directTotal)}
                  />
                  <hr className="my-2 border-border" />
                  <Row label="Saldo teórico" value={formatCurrency(theoretical)} bold />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Saldo real conferido no cartão
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={confirmedBalance}
                    onChange={(e) => setConfirmedBalance(e.target.value)}
                    className={inputCls}
                  />
                  {Math.abs(diff) > 0.01 && (
                    <p className={`mt-1 text-xs font-medium ${diff < 0 ? "text-destructive" : "text-emerald-500"}`}>
                      Diferença: {diff > 0 ? "+" : ""}
                      {formatCurrency(diff)}
                    </p>
                  )}
                </div>

                {Math.abs(diff) > 0.01 && (
                  <div className="rounded-lg border border-border/60 p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createAdjustment}
                        onChange={(e) => setCreateAdjustment(e.target.checked)}
                      />
                      Criar transação de acerto ({diff < 0 ? "despesa" : "receita"})
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Conciliação do saldo da conta — sem rubrica, fora do BP e do resultado. A nota é
                      obrigatória.
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Nota / justificação {noteRequired && <span className="text-destructive">*</span>}
                  </label>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep(pairs.length > 0 ? 2 : 1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                  </Button>
                  <Button disabled={noteRequired && !note.trim()} onClick={() => setStep(4)}>
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ================= PASSO 4 ================= */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                  <p>
                    Vão nascer <strong>{groups.length}</strong> transação(ões) paga(s) consolidada(s) no cartão{" "}
                    <strong>{session.card_name}</strong>, com os documentos dos itens e o dossier anexados.
                  </p>
                  {pairs.some((p) => p.legacy_count > 0) && (
                    <p className="mt-2 text-xs text-amber-600">
                      As despesas antigas da sessão com evento e rubrica passam a usar a linha de BP escolhida.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Depois disto a sessão fica fechada e sem edição.
                  </p>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(3)} disabled={running}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={() => void run()} disabled={running}>
                    {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Fechar e integrar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {pickPair && (
        <LinkBpLineDialog
          pickOnly
          transaction={{
            id: "",
            description: `Cartão ${session.card_name} — ${pickPair.name}`,
            amount: pickPair.amount,
            iva_rate: 0,
            event_id: pickPair.event_id,
            category_id: pickPair.category_id,
            events: { name: pickPair.eventName },
            account_categories: { code: pickPair.code, name: pickPair.name },
          }}
          onClose={() => setPickPair(null)}
          onLinked={() => setPickPair(null)}
          onPicked={(forecastId) => {
            setLineByPair((prev) => ({ ...prev, [`${pickPair.event_id}|${pickPair.category_id}`]: forecastId }));
            setPickPair(null);
          }}
        />
      )}

      {raiseLines && (
        <RaiseBudgetDialog
          lines={raiseLines}
          onClose={() => setRaiseLines(null)}
          onConfirm={(raises) => {
            setRaiseLines(null);
            void run(raises);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default CloseCardSessionModal;
