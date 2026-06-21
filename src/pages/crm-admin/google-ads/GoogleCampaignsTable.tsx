// Tab "Campanhas" do Google Ads admin.
// Lê crm.google_campaign (filtrado pela company ativa) e expõe botão de sync.
// O sync chama a edge function via supabase.functions.invoke — isto envia
// AUTOMATICAMENTE o JWT da sessão do utilizador autenticado (NÃO service-role).

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Megaphone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface GoogleCampaignRow {
  id: string;
  external_campaign_id: string;
  name: string | null;
  status: string | null;
  advertising_channel_type: string | null;
  impressions: number | null;
  clicks: number | null;
  cost_micros: number | null;
  conversions: number | null;
  conversions_value: number | null;
  last_synced_at: string | null;
}

interface SyncResultPerConnection {
  connection_id: string;
  ok: boolean;
  campaigns_fetched?: number;
  rows_returned?: number;
  upserted?: number;
  error?: string;
}

interface SyncResponse {
  ok: boolean;
  api_version?: string;
  period?: string;
  connections_processed?: number;
  results?: SyncResultPerConnection[];
  error?: string;
  detail?: string;
}

const fmtInt = new Intl.NumberFormat("pt-PT");
const fmtEur = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const fmtNum2 = new Intl.NumberFormat("pt-PT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function statusVariant(s: string | null): "default" | "secondary" | "outline" {
  if (!s) return "outline";
  if (s === "ENABLED") return "default";
  if (s === "PAUSED") return "secondary";
  return "outline";
}

export default function GoogleCampaignsTable() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["crm-google-campaigns", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<GoogleCampaignRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_campaign")
        .select(
          "id, external_campaign_id, name, status, advertising_channel_type, impressions, clicks, cost_micros, conversions, conversions_value, last_synced_at",
        )
        .eq("company_id", companyId)
        .order("cost_micros", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as GoogleCampaignRow[]) ?? [];
    },
  });

  async function handleSync() {
    if (!companyId) {
      toast.error("Sem empresa ativa.");
      return;
    }
    setSyncing(true);
    try {
      // supabase.functions.invoke envia automaticamente o Authorization
      // Bearer com o access_token da sessão do utilizador autenticado.
      // Não é usado service-role aqui.
      const { data: resp, error: invErr } = await supabase.functions.invoke(
        "crm-google-sync-campaigns",
        { body: { company_id: companyId } },
      );
      if (invErr) throw invErr;
      const r = resp as SyncResponse;

      if (!r?.ok && r?.error) {
        toast.error(`Sync falhou: ${r.error}${r.detail ? ` — ${r.detail}` : ""}`);
      } else {
        const perConn = r?.results ?? [];
        const okConns = perConn.filter((x) => x.ok);
        const fetched = okConns.reduce(
          (s, x) => s + (x.campaigns_fetched ?? 0),
          0,
        );
        const upserted = okConns.reduce((s, x) => s + (x.upserted ?? 0), 0);
        const failed = perConn.filter((x) => !x.ok);

        if (failed.length > 0) {
          toast.error(
            `Sync com erros (${failed.length}/${perConn.length} connections): ${failed[0].error?.slice(0, 200) ?? "erro desconhecido"}`,
            { duration: 10000 },
          );
        } else {
          toast.success(
            `Sync ok — ${fetched} campanhas, ${upserted} gravadas (API ${r.api_version ?? "?"})`,
          );
        }
      }
      await qc.invalidateQueries({ queryKey: ["crm-google-campaigns", companyId] });
      await refetch();
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          Espelho de campanhas Google Ads
          <Badge variant="outline" className="ml-2 text-xs">
            últimos 30 dias
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading || syncing}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Recarregar
            </Button>
            <Button size="sm" onClick={handleSync} disabled={syncing || !companyId}>
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sincronizar agora
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-destructive mb-3">
            Erro ao carregar: {(error as Error).message}
          </div>
        )}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">Campanha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Conversões</TableHead>
                <TableHead className="text-right">Valor conv.</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead>Última sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Sem campanhas. Clica em <strong>Sincronizar agora</strong> para
                    importar as campanhas da conta Google Ads ligada.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const cost = (r.cost_micros ?? 0) / 1_000_000;
                const value = Number(r.conversions_value ?? 0);
                const roas = cost > 0 ? value / cost : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div>{r.name ?? "(sem nome)"}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {r.external_campaign_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {r.advertising_channel_type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)} className="text-xs">
                        {r.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtInt.format(r.impressions ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtInt.format(r.clicks ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEur.format(cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum2.format(Number(r.conversions ?? 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEur.format(value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {roas != null ? `${fmtNum2.format(roas)}×` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_synced_at
                        ? new Date(r.last_synced_at).toLocaleString("pt-PT")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Moeda apresentada em EUR. O custo vem de <code className="text-xs">cost_micros</code> da
          conta Google Ads — se a conta estiver noutra moeda os valores não são convertidos.
        </p>
      </CardContent>
    </Card>
  );
}
