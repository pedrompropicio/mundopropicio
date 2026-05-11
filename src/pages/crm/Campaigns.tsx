import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface CampaignRow {
  id: string;
  connection_id: string;
  ad_account_id: string;
  external_campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  budget_remaining_cents: number | null;
  start_time: string | null;
  stop_time: string | null;
  updated_time: string | null;
  last_synced_at: string;
}

interface ConnectionRow {
  id: string;
  status: string;
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Vendas",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_APP_PROMOTION: "Promoção de App",
};

function objectiveLabel(o: string | null): string {
  if (!o) return "—";
  return OBJECTIVE_LABELS[o] ?? o;
}

function formatBRL(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "ACTIVE")
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativa</Badge>;
  if (status === "PAUSED")
    return <Badge className="bg-amber-500 hover:bg-amber-500">Pausada</Badge>;
  return <Badge variant="secondary">{status ?? "—"}</Badge>;
}

export default function CrmCampaigns() {
  const { role, hasPermission, loading: authLoading } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const isAuthorized =
    role === "admin" ||
    role === ("platform_admin" as any) ||
    role === ("marketing_manager" as any) ||
    hasPermission("crm.campaign.create");

  const { data: connection } = useQuery({
    queryKey: ["crm-connection-meta-active", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, status, selected_ad_account_id, selected_ad_account_name")
        .eq("platform", "meta")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as ConnectionRow | null;
    },
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["crm-meta-campaigns", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("*")
        .order("updated_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const lastSyncLabel = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return null;
    const latest = campaigns
      .map((c) => c.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    if (!latest) return null;
    return formatDistanceToNow(parseISO(latest), {
      locale: ptBR,
      addSuffix: true,
    });
  }, [campaigns]);

  const handleSync = async () => {
    if (!connection) {
      toast.error("Nenhuma conexão Meta ativa encontrada");
      return;
    }
    if (!connection.selected_ad_account_id) {
      toast.error("Selecione uma conta de anúncios primeiro em Conexões");
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-meta-sync-campaigns",
        {
          body: {
            connection_id: connection.id,
            ad_account_id: connection.selected_ad_account_id,
          },
        },
      );
      if (error) throw error;
      toast.success(`Sincronizadas ${data?.synced_count ?? 0} campanhas`);
      qc.invalidateQueries({ queryKey: ["crm-meta-campaigns"] });
    } catch (e: any) {
      console.error("[crm/campaigns] sync failed:", e);
      toast.error("Falha ao sincronizar campanhas", {
        description: e?.message ?? String(e),
      });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    const term = searchTerm.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter === "active" && c.status !== "ACTIVE") return false;
      if (statusFilter === "paused" && c.status !== "PAUSED") return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [campaigns, searchTerm, statusFilter]);

  const kpis = useMemo(() => {
    const list = campaigns ?? [];
    const active = list.filter((c) => c.status === "ACTIVE").length;
    const paused = list.filter((c) => c.status === "PAUSED").length;
    const totalDailyCents = list.reduce(
      (acc, c) => acc + (c.daily_budget_cents ?? 0),
      0,
    );
    return { total: list.length, active, paused, totalDailyCents };
  }, [campaigns]);

  if (authLoading || companyLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAuthorized) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas Meta</h1>
          <p className="text-sm text-muted-foreground">
            {lastSyncLabel
              ? `Sincronizado ${lastSyncLabel}`
              : "Sem sincronizações ainda"}
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sincronizar agora
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Total de campanhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {kpis.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Pausadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {kpis.paused}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Orçamento diário total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBRL(kpis.totalDailyCents)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {campaignsLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              {(campaigns ?? []).length === 0
                ? "Nenhuma campanha sincronizada. Clique 'Sincronizar agora' para carregar."
                : "Nenhuma campanha corresponde aos filtros."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Orçamento</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Atualizada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const budget = c.daily_budget_cents
                    ? `${formatBRL(c.daily_budget_cents)}/dia`
                    : c.lifetime_budget_cents
                      ? `${formatBRL(c.lifetime_budget_cents)} total`
                      : "—";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[280px] truncate font-medium">
                        {c.name}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {objectiveLabel(c.objective)}
                      </TableCell>
                      <TableCell className="text-sm">{budget}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.start_time
                          ? format(parseISO(c.start_time), "dd/MM/yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.updated_time
                          ? formatDistanceToNow(parseISO(c.updated_time), {
                              locale: ptBR,
                              addSuffix: true,
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
