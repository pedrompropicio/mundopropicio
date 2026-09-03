import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD_SESSION_STATUS_LABELS,
  CARD_SESSION_STATUS_VARIANTS,
  formatCurrency,
  cardItemGross,
  type CardSessionStatus,
} from "@/lib/card-session-helpers";
import { OpenCardSessionModal } from "@/components/cards/OpenCardSessionModal";
import { fetchAccountCashAdjustments } from "@/lib/account-balance";

export default function CardSessions() {
  const navigate = useNavigate();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canManage = isAdmin || isManager || hasPermission("card_manage");
  const [modalOpen, setModalOpen] = useState(false);
  const [presetCard, setPresetCard] = useState<{ id: string; balance: number } | undefined>();

  const { data: cards = [] } = useQuery({
    queryKey: ["prepaid-cards-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, initial_balance, is_active")
        .eq("type", "prepaid_card")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  /**
   * D17 — dois saldos por cartão:
   *  - contabilístico: mesma fórmula do módulo Contas (initial_balance +
   *    Σ movimentos pagos + ajustes não-monetários);
   *  - real estimado: contabilístico − itens da sessão aberta ainda não
   *    integrados (submitted + approved), que já saíram do cartão.
   */
  const { data: accountBalances } = useQuery({
    queryKey: ["financial-accounts-tx-summary", cards.map((c: any) => c.id).join(",")],
    enabled: cards.length > 0,
    queryFn: async () => {
      const ids = cards.map((c: any) => c.id);
      const [{ data: txs }, adjustments] = await Promise.all([
        supabase.from("transactions").select("account_id, type, paid_amount").in("account_id", ids),
        fetchAccountCashAdjustments(ids),
      ]);
      const m = new Map<string, number>();
      cards.forEach((c: any) => m.set(c.id, Number(c.initial_balance ?? 0)));
      for (const t of (txs ?? []) as any[]) {
        const cur = m.get(t.account_id) ?? 0;
        const amt = Number(t.paid_amount ?? 0);
        m.set(t.account_id, t.type === "income" ? cur + amt : cur - amt);
      }
      for (const [accId, adj] of adjustments) m.set(accId, (m.get(accId) ?? 0) + adj);
      return m;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["card-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_sessions")
        .select("id, card_account_id, holder_name, primary_event_id, status, opening_balance, opened_at, events:primary_event_id(name)")
        .order("opened_at", { ascending: false });
      return data ?? [];
    },
  });

  const balances = accountBalances ?? new Map<string, number>();

  const openSessionIds = (sessions as any[]).filter((s) => s.status !== "closed").map((s) => s.id);
  const { data: openItemsBySession } = useQuery({
    queryKey: ["card-session-items", openSessionIds.join(",")],
    enabled: openSessionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("card_session_items")
        .select("session_id, amount, iva_rate, status")
        .in("session_id", openSessionIds)
        .in("status", ["submitted", "approved"]);
      const m = new Map<string, number>();
      for (const it of (data ?? []) as any[]) {
        m.set(it.session_id, (m.get(it.session_id) ?? 0) + cardItemGross(it));
      }
      return m;
    },
  });

  const activeSessionByCard = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of sessions as any[]) {
      if (s.status !== "closed" && !m.has(s.card_account_id)) m.set(s.card_account_id, s);
    }
    return m;
  }, [sessions]);

  const closedSessions = (sessions as any[]).filter((s) => s.status === "closed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCard className="h-6 w-6 text-primary" /> Cartões pré-pagos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão de sessões de responsabilidade de cartões entregues a produtores.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c: any) => {
          const bal = balances.get(c.id) ?? 0;
          const active = activeSessionByCard.get(c.id);
          const openGross = active ? (openItemsBySession?.get(active.id) ?? 0) : 0;
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  {active ? (
                    <Badge className={cn("border", CARD_SESSION_STATUS_VARIANTS[active.status as CardSessionStatus])} variant="outline">
                      {CARD_SESSION_STATUS_LABELS[active.status as CardSessionStatus]}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">
                      Sem sessão
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-0.5 text-sm">
                  <div>
                    <span className="text-muted-foreground">Saldo contabilístico: </span>
                    <span className="font-semibold text-foreground">{formatCurrency(bal)}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Saldo real estimado: </span>
                    <span className="font-medium text-foreground">{formatCurrency(bal - openGross)}</span>
                    {openGross > 0 && (
                      <span className="text-muted-foreground"> (− {formatCurrency(openGross)} em itens)</span>
                    )}
                  </div>
                </div>
                {active ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
                    <div><span className="text-muted-foreground">Portador: </span>{active.holder_name}</div>
                    {active.events?.name && (
                      <div><span className="text-muted-foreground">Evento: </span>{active.events.name}</div>
                    )}
                    <button
                      onClick={() => navigate(`/cartoes/${active.id}`)}
                      className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Abrir sessão <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  canManage && (
                    <button
                      onClick={() => {
                        setPresetCard({ id: c.id, balance: bal });
                        setModalOpen(true);
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                    >
                      <Plus className="h-4 w-4" /> Entregar cartão
                    </button>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {closedSessions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Sessões fechadas</h2>
          <div className="space-y-2">
            {closedSessions.map((s: any) => (
              <button
                key={s.id}
                onClick={() => navigate(`/cartoes/${s.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>
                  <strong>{s.holder_name}</strong>
                  {s.events?.name && <> — {s.events.name}</>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(s.opened_at).toLocaleDateString("pt-PT")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <OpenCardSessionModal
        open={modalOpen}
        onOpenChange={(v) => { setModalOpen(v); if (!v) setPresetCard(undefined); }}
        presetCardAccountId={presetCard?.id}
        presetOpeningBalance={presetCard?.balance}
        onCreated={(id) => navigate(`/cartoes/${id}`)}
      />
    </div>
  );
}
