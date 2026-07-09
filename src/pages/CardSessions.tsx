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
  type CardSessionStatus,
} from "@/lib/card-session-helpers";
import { OpenCardSessionModal } from "@/components/cards/OpenCardSessionModal";

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

  const { data: allTx = [] } = useQuery({
    queryKey: ["prepaid-cards-tx", cards.map((c: any) => c.id).join(",")],
    enabled: cards.length > 0,
    queryFn: async () => {
      const ids = cards.map((c: any) => c.id);
      const { data } = await supabase
        .from("transactions")
        .select("account_id, type, paid_amount")
        .in("account_id", ids)
        .in("status", ["paid", "approved", "pending"]);
      return data ?? [];
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

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    cards.forEach((c: any) => m.set(c.id, Number(c.initial_balance ?? 0)));
    for (const t of allTx as any[]) {
      const cur = m.get(t.account_id) ?? 0;
      const amt = Number(t.paid_amount ?? 0);
      m.set(t.account_id, t.type === "income" ? cur + amt : cur - amt);
    }
    return m;
  }, [cards, allTx]);

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
                <div className="text-sm">
                  <span className="text-muted-foreground">Saldo atual: </span>
                  <span className="font-semibold text-foreground">{formatCurrency(bal)}</span>
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
