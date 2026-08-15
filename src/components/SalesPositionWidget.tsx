import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SalesPositionRow {
  group_id: string;
  event_name: string;
  event_date: string | null;
  child_count: number;
  total_qty: number;
  total_value: number;
  last7_qty: number;
  last7_value: number;
  yesterday_qty: number;
  yesterday_value: number;
  has_bol: boolean;
  daily_missing: boolean;
}

const NO_SERIES_HINT = "Série diária disponível após o próximo sync";

function Qty({ n }: { n: number }) {
  return <span className="font-mono">{Number(n || 0).toLocaleString("pt-PT")}</span>;
}

/** Célula de janela temporal: mostra "—" quando o evento BOL ainda não tem série diária. */
function WindowCell({
  qty,
  value,
  missing,
  stacked = false,
}: {
  qty: number;
  value: number;
  missing: boolean;
  stacked?: boolean;
}) {
  if (missing) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground cursor-help">—</span>
          </TooltipTrigger>
          <TooltipContent>{NO_SERIES_HINT}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <span className={stacked ? "flex flex-col items-end leading-tight" : "inline-flex items-baseline gap-2"}>
      <Qty n={qty} />
      <span className="text-xs text-muted-foreground font-mono">{formatCurrency(value || 0)}</span>
    </span>
  );
}

export function SalesPositionWidget() {
  const { companyId } = useCompany();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sales_position", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_position");
      if (error) throw error;
      return (data || []) as SalesPositionRow[];
    },
  });

  const totals = rows.reduce(
    (acc, r) => ({
      total_qty: acc.total_qty + Number(r.total_qty || 0),
      total_value: acc.total_value + Number(r.total_value || 0),
      last7_qty: acc.last7_qty + Number(r.last7_qty || 0),
      last7_value: acc.last7_value + Number(r.last7_value || 0),
      yesterday_qty: acc.yesterday_qty + Number(r.yesterday_qty || 0),
      yesterday_value: acc.yesterday_value + Number(r.yesterday_value || 0),
    }),
    { total_qty: 0, total_value: 0, last7_qty: 0, last7_value: 0, yesterday_qty: 0, yesterday_value: 0 },
  );

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Posição de Vendas
        </h2>
      </div>

      {isLoading ? (
        <p className="py-3 text-center text-sm text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">Sem vendas de bilheteira para mostrar.</p>
      ) : (
        <>
          {/* Mobile: cartões */}
          <div className="space-y-3 sm:hidden">
            {rows.map((r) => (
              <div key={r.group_id} className="glass rounded-xl border border-border/40 p-4">
                <p className="text-sm font-semibold">{r.event_name}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {r.event_date ? formatDate(r.event_date) : "—"}
                  {r.child_count > 0 ? ` • ${r.child_count} cidade${r.child_count > 1 ? "s" : ""}` : ""}
                </p>
                <div className="grid grid-cols-3 gap-2 text-right text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground text-left">Total</p>
                    <WindowCell qty={r.total_qty} value={r.total_value} missing={false} stacked />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground text-left">7 dias</p>
                    <WindowCell qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} stacked />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground text-left">Ontem</p>
                    <WindowCell qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} stacked />
                  </div>
                </div>
              </div>
            ))}
            <div className="glass rounded-xl border border-primary/30 p-4">
              <p className="text-sm font-bold mb-3">TOTAL GERAL</p>
              <div className="grid grid-cols-3 gap-2 text-right text-sm">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground text-left">Total</p>
                  <WindowCell qty={totals.total_qty} value={totals.total_value} missing={false} stacked />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground text-left">7 dias</p>
                  <WindowCell qty={totals.last7_qty} value={totals.last7_value} missing={false} stacked />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground text-left">Ontem</p>
                  <WindowCell qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} stacked />
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: tabela */}
          <div className="hidden sm:block glass rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium">Evento</th>
                  <th className="p-3 text-right font-medium">Total</th>
                  <th className="p-3 text-right font-medium">Últimos 7 dias</th>
                  <th className="p-3 text-right font-medium">Ontem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.group_id} className="border-b border-border/30 last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{r.event_name}</span>
                      {r.child_count > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({r.child_count} cidade{r.child_count > 1 ? "s" : ""})
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {r.event_date ? formatDate(r.event_date) : "—"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <WindowCell qty={r.total_qty} value={r.total_value} missing={false} />
                    </td>
                    <td className="p-3 text-right">
                      <WindowCell qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} />
                    </td>
                    <td className="p-3 text-right">
                      <WindowCell qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/50 font-bold">
                  <td className="p-3">TOTAL GERAL</td>
                  <td className="p-3 text-right">
                    <WindowCell qty={totals.total_qty} value={totals.total_value} missing={false} />
                  </td>
                  <td className="p-3 text-right">
                    <WindowCell qty={totals.last7_qty} value={totals.last7_value} missing={false} />
                  </td>
                  <td className="p-3 text-right">
                    <WindowCell qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default SalesPositionWidget;
