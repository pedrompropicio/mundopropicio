import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { isCapitalCategoryCode, capitalKindFromCode, type CapitalKind } from "@/lib/capital-branch";
import { computeHousePercentage, HOUSE_PARTNER_ID, HOUSE_PARTNER_NAME } from "@/lib/house-partner";

type CapitalFlow = "event_cash" | "partner_settlement";

const FLOW_LABEL: Record<CapitalFlow, string> = {
  event_cash: "Entrou no caixa do evento",
  partner_settlement: "Acerto entre sócios",
};


// Re-export para não quebrar importadores existentes (SSoT vive em lib/capital-branch).
export { capitalKindFromCode };
export type { CapitalKind };


const KIND_LABEL: Record<CapitalKind, string> = {
  aporte: "Aporte",
  devolucao: "Devolução de aporte",
  distribuicao: "Distribuição de resultado",
};

interface Props {
  eventId: string;
  eventStatus?: string;
  /** Modo informativo: mostra só o resumo por sócio (usado no Acerto com Sócios). */
  summaryOnly?: boolean;
}

/**
 * Capital do Sócio (AEP — Associação em Participação, DL 231/81 PT).
 * Liga transações do ramo 10.1 · Capital a um sócio do evento.
 * NÃO participa em nenhum cálculo do acerto operacional.
 */
export function PartnerCapitalPanel({ eventId, eventStatus, summaryOnly = false }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canEdit = (isAdmin || isManager) && eventStatus !== "completed" && !summaryOnly;

  const { data: subEventIds = [] } = useQuery({
    queryKey: ["sub-event-ids", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id").eq("parent_event_id", eventId);
      if (error) throw error;
      return (data ?? []).map((e: any) => e.id as string);
    },
  });

  const treeIds = [eventId, ...subEventIds];

  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Transações do ramo 10.1 · Capital em todo o tree do evento
  const { data: capitalTxs = [] } = useQuery({
    queryKey: ["partner-capital-txs", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, date, type, event_id, category_id, account_categories(code, name)")
        .in("event_id", treeIds)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((t: any) => isCapitalCategoryCode(t.account_categories?.code));
    },
    enabled: treeIds.length > 0,
  });

  const { data: links = [] } = useQuery({
    queryKey: ["partner-capital-moves", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_capital_moves")
        .select("*")
        .in("event_id", treeIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: treeIds.length > 0,
  });

  const linkByTx = new Map<string, any>((links as any[]).map((l) => [l.transaction_id, l]));

  /** Destino escolhido antes de gravar o vínculo (por transação). */
  const [flowByTx, setFlowByTx] = useState<Record<string, CapitalFlow>>({});

  // Transações OPERACIONAIS (fora do ramo 10.1) — leitura para o equilíbrio de financiamento
  const { data: opTxs = [] } = useQuery({
    queryKey: ["partner-capital-op-txs", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, paid_amount, type, status, is_transitory, is_hidden, reversed_at, account_categories(code)")
        .in("event_id", treeIds);
      if (error) throw error;
      return (data ?? []).filter(
        (t: any) =>
          !isCapitalCategoryCode(t.account_categories?.code) &&
          !t.is_transitory &&
          !t.is_hidden &&
          !t.reversed_at,
      );
    },
    enabled: treeIds.length > 0,
  });

  // Despesas pagas por cada sócio (base líquida)
  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["partner-capital-paid-expenses", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("partner_id, transactions(amount)")
        .in("event_id", treeIds)
        .eq("status", "approved");
      if (error) throw error;
      return data ?? [];
    },
    enabled: treeIds.length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-capital-moves", eventId] });
  };

  const linkMutation = useMutation({
    mutationFn: async ({ tx, partnerId, flow }: { tx: any; partnerId: string; flow: CapitalFlow }) => {
      const kind = capitalKindFromCode(tx.account_categories?.code);
      if (!kind) {
        throw new Error(
          "Só transações de capital (ramo 10.1) podem ser ligadas a um sócio como movimento de capital",
        );
      }
      const { error } = await supabase.from("partner_capital_moves").insert({
        event_id: tx.event_id,
        partner_id: partnerId,
        transaction_id: tx.id,
        kind,
        flow,
      } as any);
      if (error) throw error;
    },

    onSuccess: () => {
      invalidate();
      toast({ title: "Movimento de capital vinculado ao sócio" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_capital_moves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Vínculo removido" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // Resumo por sócio
  const summary = (partners as any[]).map((p) => {
    let aportes = 0;
    let devolucoes = 0;
    let distribuicoes = 0;
    (capitalTxs as any[]).forEach((tx) => {
      const link = linkByTx.get(tx.id);
      if (!link || link.partner_id !== p.id) return;
      const v = Number(tx.amount || 0);
      if (link.kind === "aporte") aportes += v;
      else if (link.kind === "devolucao") devolucoes += v;
      else if (link.kind === "distribuicao") distribuicoes += v;
    });
    return {
      partnerId: p.id,
      name: p.suppliers?.name ?? "—",
      aportes,
      devolucoes,
      distribuicoes,
      outstanding: aportes - devolucoes,
    };
  });

  const hasAny = summary.some((s) => s.aportes || s.devolucoes || s.distribuicoes);

  // ————— Equilíbrio de financiamento (leitura; não altera o resumo nem o acerto) —————
  const OP_EXPENSE_STATUS = ["approved", "paid", "partially_paid"];
  const OP_INCOME_STATUS = ["approved", "paid"];
  const opExpenses = (opTxs as any[]).filter((t) => t.type === "expense");
  const opIncome = (opTxs as any[]).filter((t) => t.type === "income");

  const despesaPaga = opExpenses.reduce((s, t) => s + Number(t.paid_amount || 0), 0);
  const despesaTotal = opExpenses
    .filter((t) => OP_EXPENSE_STATUS.includes(t.status))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const receitaRecebida = opIncome
    .filter((t) => OP_INCOME_STATUS.includes(t.status))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const necessidadeAtual = Math.max(0, despesaPaga - receitaRecebida);
  const necessidadeTotal = Math.max(0, despesaTotal - receitaRecebida);

  const paidByPartner = new Map<string, number>();
  (paidExpenses as any[]).forEach((pe) => {
    const v = Number(pe.transactions?.amount || 0);
    paidByPartner.set(pe.partner_id, (paidByPartner.get(pe.partner_id) ?? 0) + v);
  });

  /** Aportes por flow (para o bloco Caixa do evento). */
  let aportesEventCash = 0;
  let settlementMoves = 0;
  (capitalTxs as any[]).forEach((tx) => {
    const link = linkByTx.get(tx.id);
    if (!link) return;
    const v = Number(tx.amount || 0);
    if (link.flow === "partner_settlement") settlementMoves += v;
    else if (link.kind === "aporte") aportesEventCash += v;
  });

  const entrouNoEvento = aportesEventCash + receitaRecebida;
  const financiadoPelaMP = despesaPaga - entrouNoEvento;

  const externalRows = (partners as any[]).map((p) => {
    const s = summary.find((x) => x.partnerId === p.id);
    const pos = (s?.aportes ?? 0) - (s?.devolucoes ?? 0) + (paidByPartner.get(p.id) ?? 0);
    return { id: p.id, name: p.suppliers?.name ?? "—", pct: Number(p.percentage || 0), pos, isHouse: false };
  });

  const housePct = computeHousePercentage(partners as any[]);
  const financingRows = [...externalRows];
  if (housePct != null) {
    const posCasa = necessidadeAtual - externalRows.reduce((s, r) => s + r.pos, 0);
    financingRows.push({
      id: HOUSE_PARTNER_ID,
      name: HOUSE_PARTNER_NAME,
      pct: housePct,
      pos: posCasa,
      isHouse: true,
    });
  }

  const financing = financingRows.map((r) => {
    const competia = (r.pct / 100) * necessidadeAtual;
    return {
      ...r,
      competia,
      desvio: r.pos - competia,
      faltaAteAoFim: Math.max(0, (r.pct / 100) * necessidadeTotal - r.pos),
    };
  });

  const financingBlock = (
    <div className="space-y-4">
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Caixa do evento</span>
        </div>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="text-sm">Entrou no evento (aportes + receita recebida)</TableCell>
              <TableCell className="text-right font-mono text-success">{formatCurrency(entrouNoEvento)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-sm">Saiu (despesas pagas)</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(despesaPaga)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-sm font-medium">Financiado pela Mundo Propício</TableCell>
              <TableCell className="text-right font-mono font-bold">{formatCurrency(financiadoPelaMP)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {settlementMoves > 0 && (
          <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
            Fora do caixa do evento — acerto entre sócios: {formatCurrency(settlementMoves)}.
          </p>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Equilíbrio de financiamento
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sócio</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Já pôs</TableHead>
              <TableHead className="text-right">Competia</TableHead>
              <TableHead className="text-right">Desvio</TableHead>
              <TableHead className="text-right">Falta até ao fim</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {financing.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm font-medium">{r.name}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.pct}%</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.pos)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.competia)}</TableCell>
                <TableCell
                  className={`text-right font-mono font-medium ${r.desvio >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {r.desvio >= 0 ? "+" : ""}
                  {formatCurrency(r.desvio)}
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.faltaAteAoFim)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Competia e Falta até ao fim calculados sobre a despesa líquida da receita já recebida.
        </p>
      </div>
    </div>
  );


  if (partners.length === 0) {
    if (summaryOnly) return null;
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento. Adicione sócios no separador "Sócios" para utilizar esta funcionalidade.
      </div>
    );
  }

  if (summaryOnly && !hasAny) return null;

  const summaryTable = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sócio</TableHead>
          <TableHead className="text-right">Aportes</TableHead>
          <TableHead className="text-right">Devoluções</TableHead>
          <TableHead className="text-right">Distribuições</TableHead>
          <TableHead className="text-right">Capital em dívida</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.map((s) => (
          <TableRow key={s.partnerId}>
            <TableCell className="text-sm font-medium">{s.name}</TableCell>
            <TableCell className="text-right font-mono text-success">{formatCurrency(s.aportes)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(s.devolucoes)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(s.distribuicoes)}</TableCell>
            <TableCell className="text-right font-mono font-bold">{formatCurrency(s.outstanding)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (summaryOnly) {
    return (
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <span className="font-semibold">Capital do Sócio (AEP)</span>
          <Badge variant="outline" className="text-[10px]">informativo</Badge>
        </div>
        {summaryTable}
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Valores de capital — informativo; não incluídos no acerto operacional nesta fase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Capital do Sócio (AEP)</h3>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Movimentos de capital (ramo 10.1)
          </span>
        </div>
        {capitalTxs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Sem transações do ramo 10.1 · Capital neste evento.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Sócio</TableHead>
                {canEdit && <TableHead className="w-[40px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(capitalTxs as any[]).map((tx) => {
                const link = linkByTx.get(tx.id);
                const kind = capitalKindFromCode(tx.account_categories?.code);
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs font-mono">
                      {tx.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tx.account_categories?.code} · {tx.account_categories?.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {kind ? <Badge variant="outline" className="text-[10px]">{KIND_LABEL[kind]}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(tx.amount || 0))}</TableCell>
                    <TableCell className="min-w-[200px]">
                      {link ? (
                        <span className="text-sm">
                          {(partners as any[]).find((p) => p.id === link.partner_id)?.suppliers?.name ?? "—"}
                        </span>
                      ) : canEdit ? (
                        <SearchableSelect
                          options={(partners as any[]).map((p) => ({
                            value: p.id,
                            label: `${p.suppliers?.name} (${p.percentage}%)`,
                          }))}
                          value=""
                          onValueChange={(partnerId) => linkMutation.mutate({ tx, partnerId })}
                          placeholder="Vincular a sócio…"
                          searchPlaceholder="Pesquisar sócio…"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem vínculo</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        {link && (
                          <button
                            onClick={() => unlinkMutation.mutate(link.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Desvincular"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumo por sócio</span>
        </div>
        {summaryTable}
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Capital em dívida = Aportes − Devoluções. Valores de capital — informativo; não incluídos no acerto
          operacional nesta fase.
        </p>
      </div>
    </div>
  );
}

export default PartnerCapitalPanel;
