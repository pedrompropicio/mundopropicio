import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, ShoppingBag, ArrowRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_VARIANTS,
  SESSION_MODE_LABELS,
  formatCurrency,
  type CamarimSessionMode,
  type CamarimSessionStatus,
} from "@/lib/camarim-helpers";
import { OpenSessionModal } from "@/components/camarim/OpenSessionModal";
import { CamarimManagerDashboard } from "@/components/camarim/CamarimManagerDashboard";

interface SessionRow {
  id: string;
  title: string;
  mode: CamarimSessionMode;
  status: CamarimSessionStatus;
  budget_amount: number;
  currency: string;
  opened_at: string;
  responsible_profile_id: string | null;
  master_event_id: string | null;
  spent_total?: number;
  item_count?: number;
}

export default function Camarim() {
  const navigate = useNavigate();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canManage = isAdmin || isManager;
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showOpen, setShowOpen] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: sess } = await supabase
      .from("camarim_sessions" as any)
      .select("id,title,mode,status,budget_amount,currency,opened_at,responsible_profile_id,master_event_id")
      .order("opened_at", { ascending: false });

    const list = (sess ?? []) as any as SessionRow[];

    // Aggregate spent per session in one go
    if (list.length > 0) {
      const ids = list.map((s) => s.id);
      const { data: items } = await supabase
        .from("camarim_items" as any)
        .select("session_id,total_amount")
        .in("session_id", ids);
      const byId = new Map<string, { total: number; count: number }>();
      ((items ?? []) as any[]).forEach((it) => {
        const cur = byId.get(it.session_id) ?? { total: 0, count: 0 };
        cur.total += Number(it.total_amount ?? 0);
        cur.count += 1;
        byId.set(it.session_id, cur);
      });
      list.forEach((s) => {
        const agg = byId.get(s.id);
        s.spent_total = agg?.total ?? 0;
        s.item_count = agg?.count ?? 0;
      });
    }

    setSessions(list);
    setLoading(false);
  };

  const filtered = sessions.filter((s) =>
    search.trim() ? s.title.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Camarim — Gestão
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Análise, aprovação e fecho das contas operacionais do camarim.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("camarim_team") && (
            <Button variant="outline" onClick={() => navigate("/camarim-equipa")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Vista da equipa
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setShowOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova sessão
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard agregado das sessões abertas */}
      <CamarimManagerDashboard />

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Procurar sessão…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Sem sessões registadas.</p>
            {canManage && (
              <Button onClick={() => setShowOpen(true)} variant="outline" size="sm" className="mt-2">
                <Plus className="mr-2 h-4 w-4" /> Abrir primeira sessão
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const spent = s.spent_total ?? 0;
            const pct = s.budget_amount > 0 ? Math.min(100, (spent / s.budget_amount) * 100) : 0;
            return (
              <Card
                key={s.id}
                className="cursor-pointer transition hover:border-primary/50 hover:shadow-md"
                onClick={() => navigate(`/camarim/${s.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{s.title}</CardTitle>
                    <Badge className={cn("border", SESSION_STATUS_VARIANTS[s.status])} variant="outline">
                      {SESSION_STATUS_LABELS[s.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{SESSION_MODE_LABELS[s.mode]}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Gasto</span>
                      <span>
                        {formatCurrency(spent, s.currency)} / {formatCurrency(s.budget_amount, s.currency)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.item_count ?? 0} itens</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <OpenSessionModal open={showOpen} onOpenChange={setShowOpen} onCreated={load} />
    </div>
  );
}
