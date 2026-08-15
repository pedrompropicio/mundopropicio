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

const nf = new Intl.NumberFormat("pt-PT");

function compactValue(v: number) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) {
    return `${nf.format(Math.round(n / 100) / 10)}k €`;
  }
  return `${nf.format(Math.round(n))} €`;
}

/** Par "bilhetes · valor" em desktop. */
function Cell({ qty, value, missing }: { qty: number; value: number; missing: boolean }) {
  if (missing) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-muted-foreground">—</span>
          </TooltipTrigger>
          <TooltipContent>{NO_SERIES_HINT}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap font-mono tabular-nums">
      <span>{nf.format(Number(qty || 0))}</span>
      <span className="text-muted-foreground">·</span>
      <span className="hidden text-muted-foreground sm:inline">{formatCurrency(Number(value || 0))}</span>
      <span className="text-muted-foreground sm:hidden">{compactValue(value)}</span>
    </span>
  );
}

function formatMobileQty(qty: number) {
  const n = Math.round(Number(qty || 0));
  return n.toString();
}

function formatMobileValue(v: number) {
  const n = Math.abs(Number(v || 0));
  if (n >= 100000) {
    return `${Math.round(n / 1000)}k €`;
  }
  if (n >= 1000) {
    return `${nf.format(Math.round(n / 100) / 10)}k €`;
  }
  return `${nf.format(Math.round(n))} €`;
}

/** Par "bilhetes · valor" em mobile — ultra compacto e sem quebras. */
function MobileCell({ qty, value, missing }: { qty: number; value: number; missing: boolean }) {
  if (missing) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-muted-foreground">—</span>
          </TooltipTrigger>
          <TooltipContent>{NO_SERIES_HINT}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <span className="inline-flex items-baseline justify-end gap-0.5 whitespace-nowrap font-mono tabular-nums text-[11px]">
      <span>{formatMobileQty(qty)}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{formatMobileValue(value)}</span>
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

  const colClass = "w-[92px] shrink-0 text-right sm:w-[150px]";

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Posição de Vendas
        </h2>
      </div>

      {isLoading ? (
        <p className="py-2 text-center text-xs text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">Sem vendas de bilheteira para mostrar.</p>
      ) : (
        <div className="glass overflow-hidden rounded-lg">
          {/* Cabeçalho desktop */}
          <div className="hidden items-center gap-2 border-b border-border/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
            <span className="min-w-0 flex-1">Evento</span>
            <span className={colClass}>Total</span>
            <span className={colClass}>7 dias</span>
            <span className={colClass}>Ontem</span>
          </div>

          {/* Cabeçalho mobile */}
          <div className="grid grid-cols-3 gap-1 border-b border-border/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden">
            <span className="text-right">Total</span>
            <span className="text-right">7 dias</span>
            <span className="text-right">Ontem</span>
          </div>

          {rows.map((r) => (
            <div
              key={r.group_id}
              className="border-b border-border/30 px-3 py-1.5 text-xs last:border-0"
            >
              {/* Layout mobile */}
              <div className="flex flex-col gap-0.5 sm:hidden">
                <span className="min-w-0 truncate font-medium">
                  {r.event_name}
                  {r.child_count > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({r.child_count} cidade{r.child_count > 1 ? "s" : ""})
                    </span>
                  )}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {r.event_date ? formatDate(r.event_date) : "—"}
                  </span>
                </span>
                <div className="grid grid-cols-3 gap-1">
                  <MobileCell qty={r.total_qty} value={r.total_value} missing={false} />
                  <MobileCell qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} />
                  <MobileCell qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} />
                </div>
              </div>

              {/* Layout desktop */}
              <div className="hidden items-center gap-2 text-sm sm:flex">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.event_name}
                  {r.child_count > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({r.child_count} cidade{r.child_count > 1 ? "s" : ""})
                    </span>
                  )}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {r.event_date ? formatDate(r.event_date) : "—"}
                  </span>
                </span>
                <span className={colClass}>
                  <Cell qty={r.total_qty} value={r.total_value} missing={false} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} />
                </span>
              </div>
            </div>
          ))}

          <div className="border-t border-border/60 bg-secondary/30 px-3 py-1.5 text-xs font-bold">
            {/* Total mobile */}
            <div className="flex flex-col gap-0.5 sm:hidden">
              <span className="truncate">TOTAL GERAL</span>
              <div className="grid grid-cols-3 gap-1">
                <MobileCell qty={totals.total_qty} value={totals.total_value} missing={false} />
                <MobileCell qty={totals.last7_qty} value={totals.last7_value} missing={false} />
                <MobileCell qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} />
              </div>
            </div>

            {/* Total desktop */}
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="min-w-0 flex-1 truncate">TOTAL GERAL</span>
              <span className={colClass}>
                <Cell qty={totals.total_qty} value={totals.total_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.last7_qty} value={totals.last7_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} />
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SalesPositionWidget;
