import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Ticket, BarChart3, ArrowUpDown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { EventStatusBadge } from "@/components/EventStatusBadge";

export default function PartnerPortal() {
  const { user } = useAuth();

  const { data: accessList = [], isLoading } = useQuery({
    queryKey: ["partner_access_with_events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_event_access")
        .select("*, events(*)")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal do Parceiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Eventos aos quais tem acesso autorizado.</p>
      </div>

      {accessList.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center space-y-2">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum evento autorizado de momento.</p>
          <p className="text-xs text-muted-foreground">Contacte o administrador para solicitar acesso.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accessList.map((access: any) => {
            const event = access.events;
            if (!event) return null;
            return (
              <Link
                key={access.id}
                to={`/parceiro/evento/${event.id}`}
                className="glass rounded-xl p-5 hover:ring-2 hover:ring-primary/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{event.name}</h3>
                  <EventStatusBadge status={event.status} />
                </div>
                <p className="text-xs text-muted-foreground mb-4">{formatDate(event.date)}</p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Ticket className="h-3.5 w-3.5" /> Bilhetes</span>
                  <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" /> BP</span>
                  <span className="flex items-center gap-1"><ArrowUpDown className="h-3.5 w-3.5" /> Transações</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
