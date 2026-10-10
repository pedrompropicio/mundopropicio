import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { AlertCircle, CheckCircle2, Store, TrendingUp, TrendingDown, ArrowRight, Receipt, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";
import {
  computeTicketOfficeBalance,
  isCountedTicketOfficeTxn,
  isOpenTicketOfficeAdvance,
  INTERNAL_TRANSFER_CATEGORY_ID,
} from "@/lib/ticket-office-balance";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import { ticketOfficeOtherMovements } from "@/lib/ticket-office-reconciliation";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";


interface Props {
  officeId: string; // This is now the financial_account_id directly
  officeName: string;
}

export function TicketOfficeBalancePanel({ officeId, officeName }: Props) {
  const { isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManage = isAdmin || hasPermission("manage_accounts");
  const [openPart, setOpenPart] = useState<"pos" | "open" | "res" | null>(null);
  const [settlementModal, setSettlementModal] = useState<{ open: boolean; eventId?: string }>({ open: false });

  // Get all assignments for this office (financial_account_id)
  const { data: assignments = [] } = useQuery({
    queryKey: ["ticket_office_assignments", officeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("*, events(id, name, status)")
        .eq("financial_account_id", officeId);
      if (error) throw error;
      return data;
    },
  });

  // Get ticket sales for events assigned to this office
  const eventIds = assignments.map((a: any) => a.event_id);
  // Vendas somadas na base de dados (RPC get_ticket_office_sales) — o PostgREST corta
  // em 1.000 linhas e a Ticketline tem >4.000 registos (issue #129).
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket_office_sales_rpc", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_ticket_office_sales", {
        p_account_id: officeId,
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        event_id: r.event_id,
        financial_account_id: officeId,
        quantity: Number(r.quantity || 0),
        unit_price: 0,
        total_value: Number(r.revenue || 0),
      }));
    },
  });

  // Get transactions on the financial account
  const { data: accountTxns = [] } = useQuery({
    queryKey: ["ticket_office_account_txns", officeId],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, event_id, description, reversed_at, is_hidden, category_id")
        .eq("account_id", officeId));
      if (error) throw error;
      return data;
    },
  });

  // Pending advances (already transferred to bank, will be deducted in event settlement)
  const { data: pendingAdvances = [] } = useQuery({
    queryKey: ["ticket_office_pending_advances", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("event_id, amount, transaction_id, settlement_id")
        .eq("financial_account_id", officeId)
        .is("settlement_id", null);
      if (error) throw error;
      return data || [];
    },
  });

  // #303 — decomposição do retido: fechos (qualquer estado) e apuramentos desta bilheteira.
  const { data: settledEventIds = [] } = useQuery({
    queryKey: ["ticket_office_settled_event_ids", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ticket_office_settlements")
        .select("event_id")
        .eq("financial_account_id", officeId);
      if (error) throw error;
      return (data || []).map((r: any) => r.event_id).filter(Boolean) as string[];
    },
  });

  const { data: statements = [] } = useQuery({
    queryKey: ["ticket_office_statements_for_balance", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ticket_office_statements")
        .select("id, number, statement_date, document_total, status, ticket_office_statement_lines(id, line_type, position, description, amount, event_id)")
        .eq("financial_account_id", officeId)
        .order("statement_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    const assignedEventIds = assignments.filter((a: any) => a.events).map((a: any) => a.event_id);
    const { total, byEvent } = computeTicketOfficeBalance({
      officeId,
      assignedEventIds,
      sales: ticketSales as any[],
      transactions: accountTxns as any[],
      advances: pendingAdvances as any[],
    });

    const eventMap: Record<string, { name: string; status: string; sales: number; directExpenses: number; advances: number; isConciliated: boolean }> = {};
    assignments.forEach((a: any) => {
      if (a.events) {
        eventMap[a.event_id] = {
          name: a.events.name,
          status: a.events.status,
          sales: 0,
          directExpenses: 0,
          advances: 0,
          isConciliated: a.is_conciliated,
        };
      }
    });

    ticketSales
      .filter((s: any) => s.financial_account_id === officeId)
      .forEach((s: any) => {
        if (eventMap[s.event_id]) {
          eventMap[s.event_id].sales += ticketSaleRevenue(s);
        }
      });

    accountTxns.forEach((t: any) => {
      if (!isCountedTicketOfficeTxn(t, officeId)) return;
      // A perna de saída da transferência do fecho é uma expense com event_id na
      // rubrica 10.3 — conta no tile "Transferências", NUNCA nas despesas diretas.
      if (
        t.type === "expense" &&
        t.category_id !== INTERNAL_TRANSFER_CATEGORY_ID &&
        t.event_id &&
        eventMap[t.event_id]
      ) {
        eventMap[t.event_id].directExpenses += Number(t.paid_amount || 0);
      }
    });

    pendingAdvances.forEach((a: any) => {
      if (isOpenTicketOfficeAdvance(a) && eventMap[a.event_id]) {
        eventMap[a.event_id].advances += Number(a.amount || 0);
      }
    });

    // Transferências são despesas na rubrica 10.3 (par expense + income) — não
    // existe transação de tipo 'transfer'. Indicador de leitura, fora da fórmula do saldo.
    const totalTransfersOut = accountTxns
      .filter(
        (t: any) =>
          isCountedTicketOfficeTxn(t, officeId) &&
          t.type === "expense" &&
          t.category_id === INTERNAL_TRANSFER_CATEGORY_ID,
      )
      .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

    const totalSales = Object.values(eventMap).reduce((s, e) => s + e.sales, 0);
    const totalDirectExpenses = Object.values(eventMap).reduce((s, e) => s + e.directExpenses, 0);
    const totalAdvancesPending = Object.values(eventMap).reduce((s, e) => s + e.advances, 0);
    const globalBalance = total;

    const activeEvents = Object.values(eventMap).filter((e) => e.status !== "completed");
    const hasInconsistency = activeEvents.length === 0 && Math.abs(globalBalance) > 0.01;


    return {
      events: Object.entries(eventMap).map(([id, data]) => ({
        id,
        ...data,
        balance: byEvent[id] ?? 0,
      })),
      totalSales,
      totalDirectExpenses,
      totalTransfersOut,
      totalAdvancesPending,
      globalBalance,
      hasInconsistency,
    };
  }, [assignments, ticketSales, accountTxns, pendingAdvances, officeId]);


  if (assignments.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        Sem eventos associados
      </div>
    );
  }

  // #155 — os quatro tiles ignoram receitas lançadas como transação e movimentos
  // sem evento; este resto é o que falta para o retido fechar ao cêntimo.
  const otherMovements = ticketOfficeOtherMovements(summary.globalBalance, {
    sales: summary.totalSales,
    expenses: summary.totalDirectExpenses,
    transfers: summary.totalTransfersOut,
    advances: summary.totalAdvancesPending,
  });
  const hasOtherMovements = Math.abs(otherMovements) >= 0.01;

  // #303 — retido = posição já apurada + vendas de eventos sem fecho + por conciliar (resíduo).
  // A posição apurada já está DENTRO do retido; nunca se abate dele.
  const decomposition = (() => {
    const statement: any = (statements as any[])[0];
    if (!statement || statement.document_total == null) return null;
    const inStatement = new Set<string>();
    (statements as any[]).forEach((st: any) =>
      (st.ticket_office_statement_lines || []).forEach((l: any) => l.event_id && inStatement.add(l.event_id)),
    );
    const settled = new Set(settledEventIds as string[]);
    const openEvents = summary.events
      .filter((e) => !settled.has(e.id) && !inStatement.has(e.id) && Math.abs(e.balance) >= 0.01)
      .sort((a, b) => b.balance - a.balance);
    const position = Number(statement.document_total);
    const openTotal = Math.round(openEvents.reduce((acc, e) => acc + e.balance, 0) * 100) / 100;
    const residual = Math.round((summary.globalBalance - position - openTotal) * 100) / 100;
    const statementLines = [...(statement.ticket_office_statement_lines || [])].sort((a: any, b: any) => a.position - b.position);
    return { statement, position, openEvents, openTotal, residual, statementLines };
  })();

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-2 gap-2 ${hasOtherMovements ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Vendas</p>
          <p className="text-sm font-mono font-semibold text-emerald-500">{formatCurrency(summary.totalSales)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Desp. Diretas</p>
          <p className="text-sm font-mono font-semibold text-amber-500">{formatCurrency(summary.totalDirectExpenses)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Transferências</p>
          <p className="text-sm font-mono font-semibold">{formatCurrency(summary.totalTransfersOut)}</p>
        </div>
        {hasOtherMovements && (
          <div className="rounded-lg bg-secondary/40 p-2 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              Outros movimentos
              <HelpTooltip
                size={12}
                text="Receitas lançadas como transação nesta bilheteira e movimentos sem evento associado. É o que falta para os valores acima fecharem no retido (#155)."
              />
            </p>
            <p className={`text-sm font-mono font-semibold ${otherMovements >= 0 ? "text-emerald-500" : "text-red-400"}`}>
              {formatCurrency(otherMovements)}
            </p>
          </div>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/relatorios/bilheteiras?conta=${officeId}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/relatorios/bilheteiras?conta=${officeId}`);
          }
        }}
        title="Ver composição transação a transação"
        className={`rounded-lg p-3 text-center cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all ${summary.hasInconsistency ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/40"}`}
      >
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          Retido na Bilheteira <HelpTooltip anchor="fecho.bilheteira" size={12} />
          <HelpTooltip size={12} text="Âmbito deste painel (#129): só os eventos atribuídos a esta bilheteira." />
        </p>
        <p className={`text-lg font-mono font-bold ${summary.globalBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>
          {formatCurrency(summary.globalBalance)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Vendas − despesas − transferências ± outros movimentos = retido
        </p>
        {summary.hasInconsistency && (
          <p className="flex items-center justify-center gap-1 text-[10px] text-destructive mt-1">
            <AlertCircle className="h-3 w-3" /> Sem eventos em venda — saldo deveria ser zero
          </p>
        )}
      </div>

      {decomposition && (
        <div className="rounded-lg border border-border/60 p-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Composição do retido (já incluída nele)
          </p>
          <DecompRow
            label={`Posição já apurada (Apuramento ${decomposition.statement.number})`}
            value={decomposition.position}
            open={openPart === "pos"}
            onToggle={() => setOpenPart(openPart === "pos" ? null : "pos")}
          >
            {decomposition.statementLines.map((l: any) => (
              <li key={l.id} className="flex justify-between gap-2"><span className="truncate">{l.description}</span><span className="font-mono">{formatCurrency(Number(l.amount ?? 0))}</span></li>
            ))}
          </DecompRow>
          <DecompRow
            label={`+ Vendas de eventos ainda sem fecho (${decomposition.openEvents.length})`}
            value={decomposition.openTotal}
            open={openPart === "open"}
            onToggle={() => setOpenPart(openPart === "open" ? null : "open")}
          >
            {decomposition.openEvents.map((e) => (
              <li key={e.id} className="flex justify-between gap-2"><Link to={`/eventos/${e.id}`} className="truncate hover:underline">{e.name}</Link><span className="font-mono">{formatCurrency(e.balance)}</span></li>
            ))}
          </DecompRow>
          <DecompRow
            label="+ Por conciliar (resíduo)"
            value={decomposition.residual}
            open={openPart === "res"}
            onToggle={() => setOpenPart(openPart === "res" ? null : "res")}
          >
            <li>
              Resto entre o retido e as duas parcelas acima: faturas lançadas sem conta e bilheteira local de sala, entre outros.{" "}
              <Link to={`/relatorios/bilheteiras?conta=${officeId}`} className="text-primary hover:underline">Ver transação a transação</Link>
            </li>
          </DecompRow>
          <p className="text-[10px] text-muted-foreground pt-1">
            Posição apurada + vendas sem fecho + por conciliar = retido ({formatCurrency(summary.globalBalance)}).
          </p>
        </div>
      )}

      {summary.events.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo por Evento</h4>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2"
                onClick={() => setSettlementModal({ open: true })}
              >
                <Plus className="h-3 w-3 mr-1" /> Novo Fecho
              </Button>
            )}
          </div>
          <div className="space-y-1">
            {summary.events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors group"
              >
                <Link to={`/eventos/${ev.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs truncate">{ev.name}</span>
                  {ev.isConciliated && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                </Link>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-medium ${ev.balance > 0 ? "text-emerald-500" : ev.balance < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {formatCurrency(ev.balance)}
                  </span>
                  {canManage && Math.abs(ev.balance) > 0.01 && (
                    <button
                      onClick={() => setSettlementModal({ open: true, eventId: ev.id })}
                      className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                      title="Fechar evento nesta bilheteira"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Link to={`/eventos/${ev.id}`}>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {settlementModal.open && (
        <TicketOfficeSettlementModal
          open={settlementModal.open}
          onClose={() => setSettlementModal({ open: false })}
          officeId={officeId}
          officeName={officeName}
          defaultEventId={settlementModal.eventId}
        />
      )}
    </div>
  );
}

function DecompRow({ label, value, open, onToggle, children }: { label: string; value: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/30">
        <span className="text-left">{label}</span>
        <span className="font-mono font-medium">{formatCurrency(value)}</span>
      </button>
      {open && <ul className="ml-3 mt-1 space-y-0.5 text-[11px] text-muted-foreground">{children}</ul>}
    </div>
  );
}
