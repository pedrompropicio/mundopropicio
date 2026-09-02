import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { calcIvaAmount, calcTotalWithIva, roundCents } from "@/lib/iva";
import { isValidFechoTransaction, FECHO_TX_FILTER_COLUMNS } from "@/lib/fecho-filters";
import { toast } from "sonner";

export type RateCoherenceRow = {
  forecastId: string;
  event: string;
  categoryCode: string;
  categoryName: string;
  description: string;
  bpRate: number;
  realizedRates: number[];
  forecastBase: number;
  realizedBase: number;
  forecastGross: number;
  realizedGross: number;
  noise: number;
};

/**
 * Coerência de taxa — BP × Transações (D11).
 *
 * A taxa da TRANSAÇÃO é a verdade (vem da fatura); a da linha de BP é estimativa.
 * Quando divergem, corrige-se a LINHA — nunca o contrário — e o confronto de
 * valores faz-se sempre em base líquida.
 */
export function useRateCoherenceRows(eventId: string) {
  const { data: forecasts = [], isLoading: loadingFc } = useQuery({
    queryKey: ["iva-coherence-fc", eventId],
    queryFn: async () => {
      let q = supabase
        .from("event_forecasts")
        .select("id, description, amount, iva_rate, event_id, events(name), account_categories(code, name)")
        .is("version_id", null)
        .eq("type", "expense");
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q.limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: txs = [], isLoading: loadingTx } = useQuery({
    queryKey: ["iva-coherence-tx", eventId],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select(`id, forecast_id, amount, iva_rate, ${FECHO_TX_FILTER_COLUMNS}`)
        .not("forecast_id", "is", null);
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<RateCoherenceRow[]>(() => {
    const byForecast = new Map<string, any[]>();
    for (const t of txs as any[]) {
      if (!isValidFechoTransaction(t)) continue;
      const list = byForecast.get(t.forecast_id) ?? [];
      list.push(t);
      byForecast.set(t.forecast_id, list);
    }

    const out: RateCoherenceRow[] = [];
    for (const f of forecasts as any[]) {
      const linked = byForecast.get(f.id);
      if (!linked || linked.length === 0) continue;

      const bpRate = Number(f.iva_rate) || 0;
      const rates = Array.from(new Set(linked.map((t) => Number(t.iva_rate) || 0))).sort((a, b) => a - b);
      if (rates.length === 1 && rates[0] === bpRate) continue;

      const forecastBase = Number(f.amount) || 0;
      let realizedBase = 0;
      let realizedGross = 0;
      for (const t of linked) {
        const base = Number(t.amount) || 0;
        realizedBase = roundCents(realizedBase + base);
        realizedGross = roundCents(realizedGross + calcTotalWithIva(base, Number(t.iva_rate) || 0));
      }
      const forecastGross = calcTotalWithIva(forecastBase, bpRate);

      out.push({
        forecastId: f.id,
        event: f.events?.name ?? "—",
        categoryCode: f.account_categories?.code ?? "—",
        categoryName: f.account_categories?.name ?? "—",
        description: f.description ?? "",
        bpRate,
        realizedRates: rates,
        forecastBase,
        realizedBase,
        forecastGross,
        realizedGross,
        noise: roundCents(forecastGross - realizedGross),
      });
    }

    return out.sort((a, b) => Math.abs(b.noise) - Math.abs(a.noise));
  }, [forecasts, txs]);

  return { rows, isLoading: loadingFc || loadingTx };
}

export default function ReportIvaRateCoherence({
  eventId,
  rows,
  isLoading,
}: {
  eventId: string;
  rows: RateCoherenceRow[];
  isLoading: boolean;
}) {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("manage_bp");

  const adopt = useMutation({
    mutationFn: async (row: RateCoherenceRow) => {
      const newRate = row.realizedRates[0];
      const { error } = await supabase
        .from("event_forecasts")
        .update({ iva_rate: newRate })
        .eq("id", row.forecastId);
      if (error) throw error;
      const { error: logError } = await supabase.from("forecast_audit_log" as any).insert({
        forecast_id: row.forecastId,
        changed_by: user?.user_metadata?.full_name ?? user?.email ?? "sistema",
        field_name: "iva_rate",
        old_value: String(row.bpRate),
        new_value: String(newRate),
        observation: "Taxa alinhada com a fatura (auditoria de coerência de IVA)",
      } as any);
      if (logError) console.error("Audit log error:", logError);
    },
    onSuccess: () => {
      toast.success("Taxa da linha alinhada com a fatura.");
      queryClient.invalidateQueries({ queryKey: ["iva-coherence-fc", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar a taxa."),
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Coerência de taxa — BP × Transações</h2>
        <p className="text-xs text-muted-foreground">
          Divergência de taxa não altera o custo do evento — o confronto de valores faz-se em base líquida.
          Afecta apenas as vistas com IVA e o planeamento de tesouraria.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Todas as linhas de BP com transações vinculadas têm taxa coerente. ✅
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="font-medium">{rows.length}</span> linha(s) com taxa divergente das faturas
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Rubrica</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Taxa BP</TableHead>
                <TableHead className="text-right">Taxas realizadas</TableHead>
                <TableHead className="text-right">Previsto base</TableHead>
                <TableHead className="text-right">Realizado base</TableHead>
                <TableHead className="text-right">Previsto bruto</TableHead>
                <TableHead className="text-right">Realizado bruto</TableHead>
                <TableHead className="text-right">Ruído no bruto</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const mixed = r.realizedRates.length > 1;
                return (
                  <TableRow key={r.forecastId}>
                    <TableCell className="whitespace-nowrap">{r.event}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <span className="font-mono">{r.categoryCode}</span> {r.categoryName}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.description}</TableCell>
                    <TableCell className="text-right">{r.bpRate}%</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={mixed ? "outline" : "secondary"}>
                        {r.realizedRates.join("/")}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.forecastBase)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.realizedBase)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(r.forecastGross)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(r.realizedGross)}</TableCell>
                    <TableCell className="text-right font-medium text-warning">{formatCurrency(r.noise)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {mixed ? (
                        <span className="text-[11px] text-muted-foreground">
                          linha de natureza mista — o previsto deve ser feito pelo desembolso (D11)
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={!canEdit || adopt.isPending}
                          onClick={() => adopt.mutate(r)}
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Adotar taxa efetiva
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Mantém o cálculo de IVA fora deste ficheiro — só reexporta para uso local. */
export { calcIvaAmount };
