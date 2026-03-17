import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Ticket, ArrowRight, Plus, X } from "lucide-react";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";

interface EventForm {
  name: string;
  date: string;
  location: string;
  budget: string;
  tickets_total: string;
  status: string;
}

const emptyForm: EventForm = {
  name: "",
  date: new Date().toISOString().split("T")[0],
  location: "",
  budget: "",
  tickets_total: "",
  status: "planning",
};

export default function Events() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events_full"],
    queryFn: async () => {
      const { data: evts, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;

      // Fetch transaction totals per event
      const { data: txns } = await supabase
        .from("transactions")
        .select("event_id, type, amount");

      const totals: Record<string, { income: number; expense: number }> = {};
      (txns ?? []).forEach((t) => {
        if (!totals[t.event_id]) totals[t.event_id] = { income: 0, expense: 0 };
        if (t.type === "income") totals[t.event_id].income += Number(t.amount);
        else totals[t.event_id].expense += Number(t.amount);
      });

      return evts.map((e) => ({
        ...e,
        totalIncome: totals[e.id]?.income ?? 0,
        totalExpenses: totals[e.id]?.expense ?? 0,
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventForm) => {
      const { error } = await supabase.from("events").insert({
        name: data.name,
        date: data.date,
        location: data.location || null,
        budget: parseFloat(data.budget) || 0,
        tickets_total: parseInt(data.tickets_total) || 0,
        status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowForm(false);
      setForm(emptyForm);
      toast({ title: "Evento criado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar evento", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date) {
      toast({ title: "Preencha o nome e data do evento", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Eventos</h1>
          <p className="text-sm text-muted-foreground">Gestão e acompanhamento financeiro por evento</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Evento</span>
        </button>
      </div>

      {/* Creation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Novo Evento</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Festival de Verão 2026"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Data *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="planning">Planeamento</option>
                    <option value="active">Ativo</option>
                    <option value="completed">Concluído</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Localização</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Altice Arena, Lisboa"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Orçamento (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Bilhetes (total)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.tickets_total}
                    onChange={(e) => setForm({ ...form, tickets_total: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? "A guardar…" : "Criar Evento"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar eventos…</p>
      ) : events.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Sem eventos registados.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => {
            const profit = event.totalIncome - event.totalExpenses;
            const budgetUsed = event.budget > 0 ? (event.totalExpenses / event.budget) * 100 : 0;
            return (
              <Link
                key={event.id}
                to={`/eventos/${event.id}`}
                className="glass group rounded-xl p-5 transition-all hover:border-primary/40 hover:glow-primary animate-fade-in"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold group-hover:text-primary transition-colors">{event.name}</h3>
                    <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                  </div>
                  <EventStatusBadge status={event.status as any} />
                </div>

                {event.location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}

                {event.budget > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Orçamento</span>
                      <span className="font-mono font-medium">{budgetUsed.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Receitas</p>
                    <p className="text-sm font-bold text-success">{formatCurrency(event.totalIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Despesas</p>
                    <p className="text-sm font-bold text-warning">{formatCurrency(event.totalExpenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(profit)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ticket className="h-3 w-3" />
                    {event.tickets_sold.toLocaleString()} / {event.tickets_total.toLocaleString()} bilhetes
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
