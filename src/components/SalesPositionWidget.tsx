import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatDate } from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { lisbonToday } from "@/lib/date-lisbon";

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
  today_qty: number;
  today_value: number;
  fortnight_qty: number;
  fortnight_value: number;
  has_bol: boolean;
  daily_missing: boolean;
}

interface ProviderRow {
  provider: string;
  sort_order: number;
  total_qty: number;
  total_value: number;
  last7_qty: number;
  last7_value: number;
  yesterday_qty: number;
  yesterday_value: number;
  today_qty: number;
  today_value: number;
  fortnight_qty: number;
  fortnight_value: number;
}

const NO_SERIES_HINT = "Série diária disponível após o próximo sync";

const nf = new Intl.NumberFormat("pt-PT");
const nfNoDecimals = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 });

const LISBON_TZ = "Europe/Lisbon";

/**
 * Rótulo da quinzena de CALENDÁRIO corrente (Europe/Lisbon):
 * dias 1..15 -> "1–15/MM"; dias 16..fim -> "16–<último dia>/MM".
 * Mesma definição usada nas RPCs get_sales_position*.
 */
function fortnightLabel(): string {
  const today = lisbonToday();
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = today.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const mm = String(m + 1).padStart(2, "0");
  return day <= 15 ? `1–15/${mm}` : `16–${lastDay}/${mm}`;
}

function formatFullValue(v: number) {
  return `${nfNoDecimals.format(Math.round(Number(v || 0)))} €`;
}

/** "Sincronizado às HH:mm" (com dd/MM se não for hoje), em hora de Lisboa. */
function formatLastSync(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dayFmt = new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TZ,
    day: "2-digit",
    month: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isToday = dayFmt.format(d) === dayFmt.format(new Date());
  return isToday
    ? `Sincronizado às ${timeFmt.format(d)}`
    : `Sincronizado a ${dayFmt.format(d)} às ${timeFmt.format(d)}`;
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
      <span className="text-muted-foreground">{formatFullValue(value)}</span>
    </span>
  );
}

/** Par "bilhetes · valor" em mobile — sem compactação, valores inteiros. */
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
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1 font-mono tabular-nums text-[10px] leading-tight sm:text-[11px]">
      <span className="whitespace-nowrap">
        {nf.format(Math.round(Number(qty || 0)))}
        <span className="text-muted-foreground"> ·</span>
      </span>
      <span className="whitespace-nowrap text-muted-foreground">{formatFullValue(value)}</span>
    </span>
  );
}

/** Métrica mobile com rótulo próprio — grelha 2 colunas + Total em linha própria. */
function MobileMetric({
  label,
  qty,
  value,
  missing,
  className,
}: {
  label: string;
  qty: number;
  value: number;
  missing: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-end", className)}>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <MobileCell qty={qty} value={value} missing={missing} />
    </div>
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

  const { data: providers = [] } = useQuery({
    queryKey: ["sales_position_by_provider", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_position_by_provider");
      if (error) throw error;
      return (data || []) as ProviderRow[];
    },
  });

  const { data: lastSync } = useQuery({
    queryKey: ["sales_last_sync", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_last_sync" as any);
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });

  const lastSyncStale = lastSync
    ? Date.now() - new Date(lastSync).getTime() > 2 * 60 * 60 * 1000
    : false;

  const totals = rows.reduce(
    (acc, r) => ({
      total_qty: acc.total_qty + Number(r.total_qty || 0),
      total_value: acc.total_value + Number(r.total_value || 0),
      last7_qty: acc.last7_qty + Number(r.last7_qty || 0),
      last7_value: acc.last7_value + Number(r.last7_value || 0),
      yesterday_qty: acc.yesterday_qty + Number(r.yesterday_qty || 0),
      yesterday_value: acc.yesterday_value + Number(r.yesterday_value || 0),
      today_qty: acc.today_qty + Number(r.today_qty || 0),
      today_value: acc.today_value + Number(r.today_value || 0),
      fortnight_qty: acc.fortnight_qty + Number(r.fortnight_qty || 0),
      fortnight_value: acc.fortnight_value + Number(r.fortnight_value || 0),
    }),
    {
      total_qty: 0,
      total_value: 0,
      last7_qty: 0,
      last7_value: 0,
      yesterday_qty: 0,
      yesterday_value: 0,
      today_qty: 0,
      today_value: 0,
      fortnight_qty: 0,
      fortnight_value: 0,
    },
  );

  // Só usado no ramo >= sm (abaixo disso a linha está `hidden`).
  const colClass = "w-[104px] shrink-0 text-right md:w-[120px] lg:w-[132px]";
  const fnLabel = fortnightLabel();

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
        <div className="glass overflow-x-auto rounded-lg">
          <div className="min-w-full sm:min-w-[660px]">
          {/* Cabeçalho desktop */}
          <div className="hidden items-center gap-2 border-b border-border/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
            <span className="min-w-0 flex-1">Evento</span>
            <span className={colClass}>Agora</span>
            <span className={colClass}>Ontem</span>
            <span className={colClass}>7 dias</span>
            <span className={colClass}>Quinzena {fnLabel}</span>
            <span className={colClass}>Total</span>
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
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <MobileMetric label="Agora" qty={r.today_qty} value={r.today_value} missing={r.daily_missing} />
                  <MobileMetric label="Ontem" qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} />
                  <MobileMetric label="7 dias" qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} />
                  <MobileMetric label={`Quinz. ${fnLabel}`} qty={r.fortnight_qty} value={r.fortnight_value} missing={r.daily_missing} />
                  <MobileMetric label="Total" qty={r.total_qty} value={r.total_value} missing={false} className="col-span-2 border-t border-border/30 pt-1" />
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
                  <Cell qty={r.today_qty} value={r.today_value} missing={r.daily_missing} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.yesterday_qty} value={r.yesterday_value} missing={r.daily_missing} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.last7_qty} value={r.last7_value} missing={r.daily_missing} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.fortnight_qty} value={r.fortnight_value} missing={r.daily_missing} />
                </span>
                <span className={colClass}>
                  <Cell qty={r.total_qty} value={r.total_value} missing={false} />
                </span>
              </div>
            </div>
          ))}

          <div className="border-t border-border/60 bg-secondary/30 px-3 py-1.5 text-xs font-bold">
            {/* Total mobile */}
            <div className="flex flex-col gap-0.5 sm:hidden">
              <span className="truncate">TOTAL GERAL</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <MobileMetric label="Agora" qty={totals.today_qty} value={totals.today_value} missing={false} />
                <MobileMetric label="Ontem" qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} />
                <MobileMetric label="7 dias" qty={totals.last7_qty} value={totals.last7_value} missing={false} />
                <MobileMetric label={`Quinz. ${fnLabel}`} qty={totals.fortnight_qty} value={totals.fortnight_value} missing={false} />
                <MobileMetric label="Total" qty={totals.total_qty} value={totals.total_value} missing={false} className="col-span-2 border-t border-border/30 pt-1" />
              </div>
            </div>

            {/* Total desktop */}
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="min-w-0 flex-1 truncate">TOTAL GERAL</span>
              <span className={colClass}>
                <Cell qty={totals.today_qty} value={totals.today_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.yesterday_qty} value={totals.yesterday_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.last7_qty} value={totals.last7_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.fortnight_qty} value={totals.fortnight_value} missing={false} />
              </span>
              <span className={colClass}>
                <Cell qty={totals.total_qty} value={totals.total_value} missing={false} />
              </span>
            </div>
          </div>

          {providers.length > 0 && (
            <div className="border-t border-border/60">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Por bilheteira
              </div>
              {providers.map((p) => (
                <div
                  key={p.provider}
                  className="border-b border-border/30 px-3 py-1.5 text-xs last:border-0"
                >
                  {/* Mobile */}
                  <div className="flex flex-col gap-0.5 sm:hidden">
                    <span className="min-w-0 truncate font-medium">{p.provider}</span>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <MobileMetric label="Agora" qty={p.today_qty} value={p.today_value} missing={false} />
                      <MobileMetric label="Ontem" qty={p.yesterday_qty} value={p.yesterday_value} missing={false} />
                      <MobileMetric label="7 dias" qty={p.last7_qty} value={p.last7_value} missing={false} />
                      <MobileMetric label={`Quinz. ${fnLabel}`} qty={p.fortnight_qty} value={p.fortnight_value} missing={false} />
                      <MobileMetric label="Total" qty={p.total_qty} value={p.total_value} missing={false} className="col-span-2 border-t border-border/30 pt-1" />
                    </div>
                  </div>

                  {/* Desktop */}
                  <div className="hidden items-center gap-2 text-sm sm:flex">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.provider}</span>
                    <span className={colClass}>
                      <Cell qty={p.today_qty} value={p.today_value} missing={false} />
                    </span>
                    <span className={colClass}>
                      <Cell qty={p.yesterday_qty} value={p.yesterday_value} missing={false} />
                    </span>
                    <span className={colClass}>
                      <Cell qty={p.last7_qty} value={p.last7_value} missing={false} />
                    </span>
                    <span className={colClass}>
                      <Cell qty={p.fortnight_qty} value={p.fortnight_value} missing={false} />
                    </span>
                    <span className={colClass}>
                      <Cell qty={p.total_qty} value={p.total_value} missing={false} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lastSync && (
            <div className="border-t border-border/60 px-3 py-1 text-right text-[10px]">
              <span className={lastSyncStale ? "text-amber-500" : "text-muted-foreground"}>
                {formatLastSync(lastSync)}
              </span>
            </div>
          )}
          </div>
        </div>
      )}
    </section>
  );
}

export default SalesPositionWidget;
