import { Link } from "react-router-dom";
import { MapPin, Ticket, ArrowRight } from "lucide-react";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { events, formatCurrency, formatDate } from "@/lib/mock-data";

export default function Events() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Eventos</h1>
        <p className="text-sm text-muted-foreground">Gestão e acompanhamento financeiro por evento</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => {
          const profit = event.totalIncome - event.totalExpenses;
          const budgetUsed = (event.totalExpenses / event.budget) * 100;
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
                <EventStatusBadge status={event.status} />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </div>

              {/* Budget bar */}
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

              {/* Financials */}
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
                  {event.ticketsSold.toLocaleString()} / {event.ticketsTotal.toLocaleString()} bilhetes
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
