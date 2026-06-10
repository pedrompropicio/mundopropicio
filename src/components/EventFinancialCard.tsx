import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Settings2 } from "lucide-react";
import { useEventFinancialCardData } from "@/hooks/useEventFinancialCardData";
import {
  type CardMode, type RevenueScenario,
  readStoredMode, writeStoredMode,
} from "@/lib/event-financial-card";
import { formatCurrency } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  eventId: string;
  eventIds: string[];
  kind: "income" | "expense";
  isMasterView?: boolean;
  eventStatus?: string | null;
  primaryEventDate?: string | null;
  ticketSalesRevenue?: number;
  /** Cachê calculado efetivo (único extra legítimo — vive fora de forecasts/TX). */
  cacheImpact?: number;
  /** Callback com o displayValue actual — usado pelo card Lucro. */
  onValueChange?: (value: number) => void;
}

const MODE_LABEL: Record<CardMode, string> = {
  auto: "Auto",
  realized: "Realizado",
  committed: "Comprometido",
  forecast: "Forecast",
};

const SCENARIO_LABEL: Record<RevenueScenario, string> = {
  today: "Hoje",
  breakeven: "Break-Even",
  forecast: "Forecast",
};

const FORM_COLORS = {
  estimado: "bg-red-500/70",
  negociacao: "bg-orange-500/70",
  fechado: "bg-blue-500/70",
  pago: "bg-emerald-500/70",
};

export function EventFinancialCard(props: Props) {
  const { eventId, kind, isMasterView, onValueChange } = props;
  const { user } = useAuth();
  const userId = user?.id ?? "anon";

  const [mode, setMode] = useState<CardMode>(() => readStoredMode(userId, eventId, kind));
  const [scenario, setScenario] = useState<RevenueScenario>("forecast");

  useEffect(() => { writeStoredMode(userId, eventId, kind, mode); }, [userId, eventId, kind, mode]);

  const data = useEventFinancialCardData({
    eventId,
    eventIds: props.eventIds,
    kind,
    mode,
    scenario,
    eventStatus: props.eventStatus,
    primaryEventDate: props.primaryEventDate,
    ticketSalesRevenue: props.ticketSalesRevenue,
    masterExpenseShare: props.masterExpenseShare,
    masterForecastShare: props.masterForecastShare,
    cacheImpact: props.cacheImpact,
  });

  useEffect(() => { onValueChange?.(data.displayValue); }, [data.displayValue, onValueChange]);

  const Icon = kind === "income" ? TrendingUp : TrendingDown;
  const title = kind === "income"
    ? (isMasterView ? "Receitas (Global)" : "Receitas")
    : (isMasterView ? "Custos (Global)" : "Custos");

  const variantBorder = kind === "income" ? "border-accent/30" : "border-warning/30";
  const variantIcon = kind === "income" ? "text-accent" : "text-warning";

  const showScenarioToggle = data.modeUsed === "forecast" && kind === "income";

  // Extras visíveis (cachê e rateio turnê) — mostrados em todos os modos quando > 0.
  const extras: Array<{ label: string; value: number }> = [];
  if (kind === "expense") {
    const cache = Number(props.cacheImpact || 0);
    const masterTx = Number(props.masterExpenseShare || 0);
    const masterFc = Number(props.masterForecastShare || 0);
    if (cache > 0) extras.push({ label: "Cachê", value: cache });
    // Em realized não somamos masterForecastShare ao displayValue, logo não o mostramos.
    const includeMasterFc = data.modeUsed !== "realized" && masterFc > 0;
    const rateio = masterTx + (includeMasterFc ? masterFc : 0);
    if (rateio > 0) extras.push({ label: "Rateio turnê", value: rateio });
  }

  return (
    <div className={`glass rounded-xl p-5 border ${variantBorder} relative`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-5 w-5 ${variantIcon} shrink-0`} />
          <h3 className="text-xs font-medium text-muted-foreground truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {MODE_LABEL[mode === "auto" ? "auto" : data.modeUsed]}
            {mode === "auto" && <span className="opacity-60"> · {MODE_LABEL[data.modeUsed]}</span>}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Configurar modo"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Modo</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as CardMode)}>
                <DropdownMenuRadioItem value="auto">Auto ({MODE_LABEL[data.modeUsed]})</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="realized">Realizado</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="committed">Comprometido</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="forecast">Forecast</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {showScenarioToggle && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Cenário</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={scenario} onValueChange={(v) => setScenario(v as RevenueScenario)}>
                    <DropdownMenuRadioItem value="today">Hoje</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="breakeven">Break-Even</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="forecast">Forecast</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3">
        {data.unavailable && data.modeUsed === "forecast" && kind === "income" ? (
          <p className="text-2xl font-bold text-muted-foreground">—</p>
        ) : (
          <p className="text-2xl font-bold">{formatCurrency(data.displayValue)}</p>
        )}
        {showScenarioToggle && !data.unavailable && (
          <p className="mt-1 text-[10px] text-muted-foreground">Cenário: {SCENARIO_LABEL[scenario]}</p>
        )}
      </div>

      {/* Sub-totais ou mini-barra */}
      <div className="mt-3 min-h-[28px] space-y-1.5">
        {data.formalidadeBreakdown ? (
          <>
            <FormalidadeBar bd={data.formalidadeBreakdown} />
            {extras.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                {extras.map((e, i) => (
                  <span key={i}>+ {e.label}: {formatCurrency(e.value)}</span>
                ))}
              </div>
            )}
          </>
        ) : data.subtotals.length > 0 || extras.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {data.subtotals.map((s, i) => (
              <span key={`s${i}`}>
                <span className="font-medium text-foreground/70">{s.label}:</span>{" "}
                {s.value === null ? <span className="opacity-60">—</span> : formatCurrency(s.value)}
              </span>
            ))}
            {extras.map((e, i) => (
              <span key={`e${i}`}>
                <span className="font-medium text-foreground/70">{e.label}:</span>{" "}
                {formatCurrency(e.value)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FormalidadeBar({ bd }: { bd: { estimado: number; negociacao: number; fechado: number; pago: number } }) {
  const total = bd.estimado + bd.negociacao + bd.fechado + bd.pago;
  if (total <= 0) {
    return <p className="text-[11px] text-muted-foreground">Sem linhas aprovadas no BP.</p>;
  }
  const pct = (v: number) => (v / total) * 100;
  const segments: Array<{ key: keyof typeof FORM_COLORS; label: string; value: number }> = [
    { key: "estimado", label: "Estimado", value: bd.estimado },
    { key: "negociacao", label: "Negociação", value: bd.negociacao },
    { key: "fechado", label: "Fechado", value: bd.fechado },
    { key: "pago", label: "Pago", value: bd.pago },
  ];
  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
          {segments.map((s) => s.value > 0 && (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <div
                  className={`${FORM_COLORS[s.key]} hover:opacity-100 opacity-90 transition-opacity`}
                  style={{ width: `${pct(s.value)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  <span className="font-medium">{s.label}:</span> {formatCurrency(s.value)} ({pct(s.value).toFixed(0)}%)
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {segments.filter((s) => s.value > 0).map((s) => (
            <span key={s.key}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${FORM_COLORS[s.key]} mr-1 align-middle`} />
              {s.label}: {formatCurrency(s.value)}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
