/**
 * Tesouraria — Fase 3: Alocação gerencial entre eventos (overlay).
 *
 * Camada de DOCUMENTAÇÃO: regista decisões manuais de "quem financia quem"
 * entre eventos. NÃO move dinheiro. NÃO altera DRE, BP, Acerto de Sócios,
 * Resultado nem as posições da Fase 1. Decisão 100% manual e gerencial.
 *
 * Reutiliza `get_event_cash_position` (Fase 1) para calcular excedente livre
 * e défice por evento.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ArrowLeft, AlertTriangle, Users, Info, Plus, Check, Trash2, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import HelpTooltip from "@/components/HelpTooltip";
import { toast } from "sonner";
import { format } from "date-fns";

interface RpcRow {
  level: "event" | "common";
  event_id: string | null;
  master_event_id: string | null;
  parent_event_id: string | null;
  event_name: string;
  event_date: string | null;
  is_sub: boolean;
  realized: number;
  committed: number;
  pending: number;
}

interface Allocation {
  id: string;
  from_event_id: string;
  to_event_id: string;
  amount: number;
  allocation_date: string;
  reason: string | null;
  status: "active" | "equalized";
  created_at: string;
}

interface EventInfo {
  id: string;
  free: number;          // excedente livre = (realized+committed) − Σ alocações ativas (origem)
  realized: number;      // composição: parte firme do free
  committed: number;     // composição: parte por entrar do free
  surplusTotal: number;  // realized+committed (antes de descontar alocações)
  allocatedOut: number;  // Σ alocações ativas como origem
  need: number;          // |posição negativa| − Σ alocações ativas como destino
  deficit: number;       // posição negativa original (positivo)
  allocatedIn: number;   // Σ alocações ativas como destino
  name: string;
  date: string | null;
  hasPartnerWaiting: boolean;
}

export default function TreasuryAllocations() {
  const { companyId, isLoading: cLoading } = useCompany();
  const { hasPermission, isAdmin, user } = useAuth();
  const canView = isAdmin || hasPermission("view_balances") || hasPermission("manage_accounts");
  const canEdit = isAdmin || hasPermission("manage_accounts");
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState<{ fromId?: string; toId?: string } | null>(null);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [toDelete, setToDelete] = useState<Allocation | null>(null);

  const { data: rows = [] } = useQuery<RpcRow[]>({
    queryKey: ["treasury-positions", companyId, null, null],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_event_cash_position", {
        p_company_id: companyId, p_date_from: null, p_date_to: null,
      });
      if (error) throw error;
      return (data as RpcRow[]) ?? [];
    },
  });

  const { data: allocations = [] } = useQuery<Allocation[]>({
    queryKey: ["event-cash-allocations", companyId],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cash_allocations" as any)
        .select("id, from_event_id, to_event_id, amount, allocation_date, reason, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // Quem tem sócios externos com paid_expenses por liquidar
  const { data: partnerWaitingSet = new Set<string>() } = useQuery({
    queryKey: ["partner-paid-pending", companyId],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("event_id, paid_date");
      if (error) throw error;
      const s = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        if (!r.paid_date) s.add(r.event_id);
      }
      return s;
    },
  });

  const { events, surplusList, deficitList } = useMemo(() => {
    const activeAlloc = allocations.filter((a) => a.status === "active");
    const outBy = new Map<string, number>();
    const inBy = new Map<string, number>();
    for (const a of activeAlloc) {
      outBy.set(a.from_event_id, (outBy.get(a.from_event_id) ?? 0) + Number(a.amount));
      inBy.set(a.to_event_id, (inBy.get(a.to_event_id) ?? 0) + Number(a.amount));
    }
    const list: EventInfo[] = [];
    for (const r of rows) {
      if (r.level !== "event" || !r.event_id) continue;
      const realized = Number(r.realized) || 0;
      const committed = Number(r.committed) || 0;
      const surplusTotal = realized + committed;
      const allocatedOut = outBy.get(r.event_id) ?? 0;
      const allocatedIn = inBy.get(r.event_id) ?? 0;
      const free = surplusTotal - allocatedOut;
      const deficit = surplusTotal < 0 ? -surplusTotal : 0;
      const need = Math.max(0, deficit - allocatedIn);
      list.push({
        id: r.event_id,
        free,
        realized,
        committed,
        surplusTotal,
        allocatedOut,
        need,
        deficit,
        allocatedIn,
        name: r.event_name,
        date: r.event_date,
        hasPartnerWaiting: partnerWaitingSet.has(r.event_id),
      });
    }
    const byId = new Map(list.map((e) => [e.id, e]));
    const surplusList = list
      .filter((e) => e.surplusTotal > 0.005)
      .sort((a, b) => b.free - a.free);
    const deficitList = list
      .filter((e) => e.deficit > 0.005)
      .sort((a, b) => {
        if (a.hasPartnerWaiting !== b.hasPartnerWaiting) return a.hasPartnerWaiting ? -1 : 1;
        return b.need - a.need;
      });
    return { events: byId, surplusList, deficitList };
  }, [rows, allocations, partnerWaitingSet]);

  const totals = useMemo(() => {
    const totalSurplus = surplusList.reduce((s, e) => s + Math.max(0, e.free), 0);
    const totalDeficit = deficitList.reduce((s, e) => s + e.need, 0);
    return { totalSurplus, totalDeficit, nSurplus: surplusList.length, nDeficit: deficitList.length };
  }, [surplusList, deficitList]);

  const createMut = useMutation({
    mutationFn: async (payload: {
      from_event_id: string; to_event_id: string; amount: number;
      allocation_date: string; reason: string | null;
    }) => {
      const fromEv = events.get(payload.from_event_id);
      const toEv = events.get(payload.to_event_id);
      if (!fromEv || !toEv) throw new Error("Eventos inválidos.");
      if (payload.from_event_id === payload.to_event_id)
        throw new Error("Origem e destino têm de ser diferentes.");
      if (payload.amount <= 0) throw new Error("Valor tem de ser positivo.");
      if (payload.amount > fromEv.free + 0.005)
        throw new Error(`Excede o livre da origem (${formatCurrency(fromEv.free)}).`);
      if (payload.amount > toEv.need + 0.005)
        throw new Error(`Excede a necessidade do destino (${formatCurrency(toEv.need)}).`);
      const { error } = await supabase.from("event_cash_allocations" as any).insert({
        from_event_id: payload.from_event_id,
        to_event_id: payload.to_event_id,
        amount: payload.amount,
        allocation_date: payload.allocation_date,
        reason: payload.reason,
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alocação registada.");
      qc.invalidateQueries({ queryKey: ["event-cash-allocations", companyId] });
      setCreateOpen(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registar."),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: { id: string; amount?: number; reason?: string | null; allocation_date?: string; status?: "active" | "equalized" }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("event_cash_allocations" as any).update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alocação atualizada.");
      qc.invalidateQueries({ queryKey: ["event-cash-allocations", companyId] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro."),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_cash_allocations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alocação removida.");
      qc.invalidateQueries({ queryKey: ["event-cash-allocations", companyId] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro."),
  });

  if (!canView) {
    return <div className="p-6 text-sm text-muted-foreground">Sem permissão.</div>;
  }
  if (cLoading) return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4 p-3 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            Alocação de Tesouraria
            <HelpTooltip text="Overlay manual: regista quem financia quem entre eventos. NÃO move dinheiro, NÃO altera DRE/BP/Acerto/Resultado. É documentação gerencial." />
          </h1>
          <p className="text-xs text-muted-foreground">
            Decisão 100% manual. Reutiliza a posição de tesouraria por evento.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/tesouraria">← Voltar à Tesouraria</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI label="Excedentes livres" value={totals.totalSurplus} sub={`${totals.nSurplus} eventos`} good />
        <KPI label="Défices a cobrir" value={totals.totalDeficit} sub={`${totals.nDeficit} eventos`} bad />
        <KPI label="Alocações ativas" value={allocations.filter((a) => a.status === "active").reduce((s, a) => s + Number(a.amount), 0)} sub={`${allocations.filter((a) => a.status === "active").length} linhas`} />
        <KPI label="Saldo livre líquido" value={totals.totalSurplus - totals.totalDeficit}
             hint="Σ excedentes livres − Σ défices ainda por cobrir." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-md border bg-card">
          <div className="p-2 border-b flex items-center gap-2 text-xs font-semibold">
            <ArrowRight className="h-3 w-3 text-emerald-500" />
            Eventos com excedente livre
            <Badge variant="outline" className="ml-auto text-[10px]">{surplusList.length}</Badge>
          </div>
          <div className="divide-y">
            {surplusList.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">Sem excedentes.</div>
            )}
            {surplusList.map((e) => (
              <div key={e.id} className="p-2 flex items-start justify-between gap-2 hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{e.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.date ?? "—"} · livre: <span className={e.free > 0.005 ? "text-emerald-500 font-mono" : "text-muted-foreground font-mono"}>{formatCurrency(e.free)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Composição: firme <span className="font-mono">{formatCurrency(e.realized)}</span> · por entrar <span className="font-mono">{formatCurrency(e.committed)}</span>
                    {e.allocatedOut > 0.005 && <> · já alocado <span className="font-mono text-amber-500">−{formatCurrency(e.allocatedOut)}</span></>}
                  </div>
                  {e.free < 0.005 && e.surplusTotal > 0.005 && (
                    <div className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" /> Tudo comprometido em alocações.
                    </div>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={e.free < 0.005}
                          onClick={() => setCreateOpen({ fromId: e.id })}>
                    <Plus className="h-3 w-3 mr-1" /> Alocar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <div className="p-2 border-b flex items-center gap-2 text-xs font-semibold">
            <ArrowLeft className="h-3 w-3 text-red-400" />
            Eventos em défice
            <Badge variant="outline" className="ml-auto text-[10px]">{deficitList.length}</Badge>
          </div>
          <div className="divide-y">
            {deficitList.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">Sem défices.</div>
            )}
            {deficitList.map((e) => (
              <div key={e.id} className="p-2 flex items-start justify-between gap-2 hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate flex items-center gap-1">
                    {e.name}
                    {e.hasPartnerWaiting && (
                      <span title="Sócios externos com despesas por liquidar — prioridade de liquidez">
                        <Users className="h-3 w-3 text-amber-500" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.date ?? "—"} · necessidade: <span className={e.need > 0.005 ? "text-red-400 font-mono" : "text-emerald-500 font-mono"}>{formatCurrency(e.need)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Défice total <span className="font-mono">{formatCurrency(e.deficit)}</span>
                    {e.allocatedIn > 0.005 && <> · já coberto <span className="font-mono text-emerald-500">{formatCurrency(e.allocatedIn)}</span></>}
                  </div>
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={e.need < 0.005}
                          onClick={() => setCreateOpen({ toId: e.id })}>
                    <Plus className="h-3 w-3 mr-1" /> Cobrir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="p-2 border-b flex items-center gap-2 text-xs font-semibold">
          Alocações registadas
          <Badge variant="outline" className="ml-auto text-[10px]">{allocations.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">De (credor)</th>
                <th className="text-left p-2">Para (devedor)</th>
                <th className="text-right p-2">Valor</th>
                <th className="text-left p-2 hidden sm:table-cell">Motivo</th>
                <th className="text-left p-2">Estado</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Sem alocações.</td></tr>
              )}
              {allocations.map((a) => {
                const from = events.get(a.from_event_id);
                const to = events.get(a.to_event_id);
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 font-mono text-[11px]">{a.allocation_date}</td>
                    <td className="p-2">{from?.name ?? <span className="text-muted-foreground">{a.from_event_id.slice(0,8)}…</span>}</td>
                    <td className="p-2">{to?.name ?? <span className="text-muted-foreground">{a.to_event_id.slice(0,8)}…</span>}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(Number(a.amount))}</td>
                    <td className="p-2 hidden sm:table-cell text-muted-foreground truncate max-w-[260px]">{a.reason ?? "—"}</td>
                    <td className="p-2">
                      {a.status === "active"
                        ? <Badge variant="secondary" className="text-[10px]">Ativa</Badge>
                        : <Badge variant="outline" className="text-[10px]">Equalizada</Badge>}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {canEdit && a.status === "active" && (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6"
                                  title="Editar" onClick={() => setEditing(a)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6"
                                  title="Marcar equalizada"
                                  onClick={() => updateMut.mutate({ id: a.id, status: "equalized" })}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400"
                                  title="Remover" onClick={() => setToDelete(a)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
        <Info className="h-3 w-3 mt-px shrink-0" />
        Esta camada é <strong>documentação gerencial</strong> — não move dinheiro nem altera DRE, BP, Acerto de Sócios ou Resultado. A participação de sócios é apenas sinal de prioridade.
      </p>

      <AllocationDialog
        open={!!createOpen}
        onClose={() => setCreateOpen(null)}
        initialFromId={createOpen?.fromId}
        initialToId={createOpen?.toId}
        surplusList={surplusList}
        deficitList={deficitList}
        onSubmit={(v) => createMut.mutate(v)}
        loading={createMut.isPending}
      />

      <EditAllocationDialog
        allocation={editing}
        onClose={() => setEditing(null)}
        onSubmit={(v) => updateMut.mutate(v)}
        loading={updateMut.isPending}
        fromEv={editing ? events.get(editing.from_event_id) ?? null : null}
        toEv={editing ? events.get(editing.to_event_id) ?? null : null}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover alocação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o registo de quem-financia-quem. Não afeta caixa nem DRE.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteMut.mutate(toDelete.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KPI({ label, value, sub, hint, good, bad }: {
  label: string; value: number; sub?: string; hint?: string; good?: boolean; bad?: boolean;
}) {
  const cls = good ? "text-emerald-500" : bad ? "text-red-400" : "";
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {label}{hint && <HelpTooltip text={hint} size={10} />}
      </p>
      <p className={`text-sm font-mono font-semibold ${cls}`}>{formatCurrency(value)}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AllocationDialog({
  open, onClose, initialFromId, initialToId, surplusList, deficitList, onSubmit, loading,
}: {
  open: boolean; onClose: () => void;
  initialFromId?: string; initialToId?: string;
  surplusList: EventInfo[]; deficitList: EventInfo[];
  onSubmit: (v: { from_event_id: string; to_event_id: string; amount: number; allocation_date: string; reason: string | null }) => void;
  loading: boolean;
}) {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState<string>("");

  // Reset on open
  useMemo(() => {
    if (open) {
      setFromId(initialFromId ?? "");
      setToId(initialToId ?? "");
      setAmount("");
      setReason("");
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, initialFromId, initialToId]);

  const from = surplusList.find((e) => e.id === fromId);
  const to = deficitList.find((e) => e.id === toId);
  const cap = Math.min(from?.free ?? Infinity, to?.need ?? Infinity);
  const amountNum = Number(amount.replace(",", "."));
  const exceedsFrom = from && amountNum > from.free + 0.005;
  const exceedsTo = to && amountNum > to.need + 0.005;
  const canSubmit = !!fromId && !!toId && fromId !== toId && amountNum > 0 && !exceedsFrom && !exceedsTo;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova alocação</DialogTitle>
          <DialogDescription>
            Liga manualmente um evento credor a um evento devedor. Documentação gerencial — não move dinheiro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">De (excedente)</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Evento credor" /></SelectTrigger>
              <SelectContent>
                {surplusList.map((e) => (
                  <SelectItem key={e.id} value={e.id} disabled={e.free < 0.005}>
                    {e.name} — livre {formatCurrency(e.free)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {from && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Firme {formatCurrency(from.realized)} · por entrar {formatCurrency(from.committed)} · livre {formatCurrency(from.free)}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Para (défice)</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Evento devedor" /></SelectTrigger>
              <SelectContent>
                {deficitList.map((e) => (
                  <SelectItem key={e.id} value={e.id} disabled={e.need < 0.005 || e.id === fromId}>
                    {e.name} — precisa {formatCurrency(e.need)}{e.hasPartnerWaiting ? " ⚠" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {to && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Necessidade {formatCurrency(to.need)}{to.hasPartnerWaiting ? " · sócios externos por liquidar" : ""}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor (€)</Label>
              <Input type="number" step="0.01" min="0" value={amount}
                     onChange={(e) => setAmount(e.target.value)}
                     className="h-9 text-xs" />
              {Number.isFinite(cap) && cap > 0 && (
                <button type="button" className="text-[10px] text-primary underline mt-0.5"
                        onClick={() => setAmount(cap.toFixed(2))}>
                  Usar máximo {formatCurrency(cap)}
                </button>
              )}
              {exceedsFrom && <p className="text-[10px] text-red-400">Excede o livre da origem.</p>}
              {exceedsTo && <p className="text-[10px] text-red-400">Excede a necessidade do destino.</p>}
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex.: Excedente do Festival X cobre adiantamento do evento Y."
                      className="text-xs min-h-[60px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canSubmit || loading} onClick={() => onSubmit({
            from_event_id: fromId, to_event_id: toId, amount: amountNum,
            allocation_date: date, reason: reason.trim() || null,
          })}>Registar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAllocationDialog({
  allocation, onClose, onSubmit, loading, fromEv, toEv,
}: {
  allocation: Allocation | null; onClose: () => void;
  onSubmit: (v: { id: string; amount: number; reason: string | null; allocation_date: string }) => void;
  loading: boolean;
  fromEv: EventInfo | null; toEv: EventInfo | null;
}) {
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  useMemo(() => {
    if (allocation) {
      setAmount(String(allocation.amount));
      setDate(allocation.allocation_date);
      setReason(allocation.reason ?? "");
    }
  }, [allocation]);

  if (!allocation) return null;
  const original = Number(allocation.amount);
  const amountNum = Number(amount.replace(",", "."));
  // Para edição: livre da origem JÁ inclui esta alocação como out; a margem real é free + original.
  const maxFrom = (fromEv?.free ?? 0) + original;
  const maxTo = (toEv?.need ?? 0) + original;
  const cap = Math.min(maxFrom, maxTo);
  const exceeds = amountNum > cap + 0.005;
  const canSubmit = amountNum > 0 && !exceeds;

  return (
    <Dialog open={!!allocation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar alocação</DialogTitle>
          <DialogDescription>
            {fromEv?.name ?? "?"} → {toEv?.name ?? "?"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Valor (€)</Label>
            <Input type="number" step="0.01" min="0" value={amount}
                   onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Máximo: {formatCurrency(cap)}</p>
            {exceeds && <p className="text-[10px] text-red-400">Excede o livre/necessidade.</p>}
          </div>
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                      className="text-xs min-h-[60px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canSubmit || loading} onClick={() => onSubmit({
            id: allocation.id, amount: amountNum,
            reason: reason.trim() || null, allocation_date: date,
          })}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
