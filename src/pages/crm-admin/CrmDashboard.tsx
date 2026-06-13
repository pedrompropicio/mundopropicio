import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users, Inbox, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Stat = {
  to: string;
  key: string;
  label: string;
  icon: typeof CalendarDays;
  value: number | null;
};

async function safeCount(
  table: string,
  apply?: (q: any) => any,
): Promise<number | null> {
  try {
    let q: any = (supabase as any).from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default function CrmDashboard() {
  const { data: eventsMk } = useQuery({
    queryKey: ["crm-stats", "event_marketing"],
    queryFn: () =>
      safeCount("event_marketing", (q) => q.eq("status", "published")),
    staleTime: 60_000,
  });
  const { data: contacts } = useQuery({
    queryKey: ["crm-stats", "contacts"],
    queryFn: () => safeCount("contacts", (q) => q.eq("is_active", true)),
    staleTime: 60_000,
  });
  const { data: leads } = useQuery({
    queryKey: ["crm-stats", "leads-30d"],
    queryFn: () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      return safeCount("leads", (q) => q.gte("created_at", since));
    },
    staleTime: 60_000,
  });
  const { data: audiences } = useQuery({
    queryKey: ["crm-stats", "audiences"],
    queryFn: () => safeCount("audiences"),
    staleTime: 60_000,
  });

  const stats: Stat[] = [
    { to: "/crm/eventos", key: "events", label: "Eventos com Marketing", icon: CalendarDays, value: eventsMk ?? null },
    { to: "/crm/contactos", key: "contacts", label: "Contactos", icon: Users, value: contacts ?? null },
    { to: "/crm/leads", key: "leads", label: "Leads (30 dias)", icon: Inbox, value: leads ?? null },
    { to: "/crm/audiences", key: "audiences", label: "Audiências", icon: Target, value: audiences ?? null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MP CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendas, relacionamento e marketing — visão geral
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <s.icon className="h-4 w-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {s.value === null ? "—" : s.value.toLocaleString("pt-PT")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Módulo em fase inicial. Próximas secções: editor de marketing por evento, blog, páginas
          estáticas, contactos, leads e audiências. Esta dashboard será enriquecida ao longo das
          fases seguintes.
        </CardContent>
      </Card>
    </div>
  );
}
