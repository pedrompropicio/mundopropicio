import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  ArrowUpDown,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/mock-data";

interface Alert {
  id: string;
  type: "overdue" | "pending_approval" | "budget_exceeded" | "upcoming_due";
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  path?: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const { data: transactions = [] } = useQuery({
    queryKey: ["notif-transactions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, description, amount, type, status, due_date, event_id, paid_amount")
        .in("status", ["pending", "approved", "overdue"])
        .order("due_date", { ascending: true });
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["notif-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, budget, status")
        .in("status", ["planning", "confirmed", "active"]);
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["notif-all-tx"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("event_id, amount, type")
        .in("status", ["approved", "paid"]);
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: pendingForecasts = [] } = useQuery({
    queryKey: ["notif-forecasts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_forecasts")
        .select("id, description, event_id, type, status")
        .eq("status", "draft");
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: pendingPaymentLists = [] } = useQuery({
    queryKey: ["notif-payment-lists"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_lists")
        .select("id, title, payment_date, created_by, status")
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const alerts = useMemo(() => {
    const result: Alert[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDays = new Date(today);
    threeDays.setDate(threeDays.getDate() + 3);

    // 1. Overdue payments
    transactions
      .filter((t) => t.status === "overdue" || (t.due_date && new Date(t.due_date) < today && t.status !== "paid"))
      .forEach((t) => {
        result.push({
          id: `overdue-${t.id}`,
          type: "overdue",
          severity: "error",
          title: "Pagamento vencido",
          description: `${t.description} — ${formatCurrency(Number(t.amount) - Number(t.paid_amount))} em aberto`,
          path: "/transacoes",
        });
      });

    // 2. Upcoming due (next 3 days)
    transactions
      .filter((t) => {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        return due >= today && due <= threeDays && t.status !== "paid";
      })
      .forEach((t) => {
        const dueDate = new Date(t.due_date!);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
        result.push({
          id: `upcoming-${t.id}`,
          type: "upcoming_due",
          severity: "warning",
          title: diffDays === 0 ? "Vence hoje" : `Vence em ${diffDays} dia${diffDays > 1 ? "s" : ""}`,
          description: `${t.description} — ${formatCurrency(Number(t.amount))}`,
          path: "/transacoes",
        });
      });

    // 3. Pending approvals
    const pendingCount = transactions.filter((t) => t.status === "pending").length;
    if (pendingCount > 0) {
      result.push({
        id: "pending-approvals",
        type: "pending_approval",
        severity: "info",
        title: "Transações aguardando aprovação",
        description: `${pendingCount} transaç${pendingCount === 1 ? "ão" : "ões"} pendente${pendingCount === 1 ? "" : "s"}`,
        path: "/transacoes",
      });
    }

    // 4. Pending BP forecasts
    if (pendingForecasts.length > 0) {
      const eventIds = [...new Set(pendingForecasts.map((f) => f.event_id))];
      const evtNames = eventIds
        .map((id) => events.find((e) => e.id === id)?.name)
        .filter(Boolean);
      result.push({
        id: "pending-forecasts",
        type: "pending_approval",
        severity: "info",
        title: "Previsões BP pendentes",
        description: `${pendingForecasts.length} previsão(ões) em ${evtNames.length} evento(s)`,
        path: evtNames.length === 1 ? `/eventos/${eventIds[0]}` : "/eventos",
      });
    }

    // 5. Pending payment lists
    if (pendingPaymentLists.length > 0) {
      result.push({
        id: "pending-payment-lists",
        type: "pending_approval",
        severity: "warning",
        title: "Listas de pagamento pendentes",
        description: `${pendingPaymentLists.length} lista(s) aguardando aprovação`,
        path: "/relatorios/listas-pagamento",
      });
    }

    // 6. Budget exceeded
    events.forEach((evt) => {
      if (!evt.budget || evt.budget <= 0) return;
      const evtExpenses = allTransactions
        .filter((t) => t.event_id === evt.id && t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0);
      const pct = (evtExpenses / evt.budget) * 100;
      if (pct >= 100) {
        result.push({
          id: `budget-${evt.id}`,
          type: "budget_exceeded",
          severity: "error",
          title: "Orçamento ultrapassado",
          description: `${evt.name}: ${formatCurrency(evtExpenses)} / ${formatCurrency(evt.budget)} (${pct.toFixed(0)}%)`,
          path: `/eventos/${evt.id}`,
        });
      } else if (pct >= 85) {
        result.push({
          id: `budget-warn-${evt.id}`,
          type: "budget_exceeded",
          severity: "warning",
          title: "Orçamento próximo do limite",
          description: `${evt.name}: ${pct.toFixed(0)}% utilizado`,
          path: `/eventos/${evt.id}`,
        });
      }
    });

    return result;
  }, [transactions, events, allTransactions, pendingForecasts]);

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const errorCount = visibleAlerts.filter((a) => a.severity === "error").length;
  const totalCount = visibleAlerts.length;

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const handleClick = (alert: Alert) => {
    if (alert.path) {
      setOpen(false);
      navigate(alert.path);
    }
  };

  const severityIcon = (severity: Alert["severity"]) => {
    switch (severity) {
      case "error":
        return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />;
      case "warning":
        return <Clock className="h-4 w-4 shrink-0 text-warning" />;
      case "info":
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
          <Bell className="h-5 w-5" />
          {totalCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                errorCount > 0 ? "bg-destructive" : "bg-primary"
              )}
            >
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Notificações</h3>
          {visibleAlerts.length > 0 && (
            <button
              onClick={() => setDismissed(new Set(alerts.map((a) => a.id)))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar todas
            </button>
          )}
        </div>
        <div className="overflow-y-auto">
          {visibleAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">Sem notificações</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/30 cursor-pointer"
                  onClick={() => handleClick(alert)}
                >
                  {severityIcon(alert.severity)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-tight">
                      {alert.description}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(alert.id);
                    }}
                    className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
