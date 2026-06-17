import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Settings2 } from "lucide-react";
import {
  usePartnerFinancialCardData,
  type PartnerTxRow, type PartnerForecastRow,
} from "@/hooks/usePartnerFinancialCardData";
import { type CardMode } from "@/lib/event-financial-card";
import { formatCurrency } from "@/lib/mock-data";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Wrapper de apresentação dos cards financeiros para o PORTAL SÓCIO.
 * Consome `usePartnerFinancialCardData` (3 regras permanentes do sócio).
 * NÃO toca no staff — UI espelha visualmente o EventFinancialCard para
 * manter coerência, mas a key de localStorage é prefixada `partner-`.
 */

interface Props {
  kind: "income" | "expense";
  eventId: string;
  userId: string;
  eventStatus?: string | null;
  primaryEventDate?: string | null;
  transactions: PartnerTxRow[];
  forecasts: PartnerForecastRow[];
  ticketRevenueNet?: number;
  ticketCargasNet?: number;
  masterExpenseShareGross?: number;
  masterForecastShareGross?: number;
  cacheImpactGross?: number;
  onValueChange?: (value: number) => void;
}

const MODE_LABEL: Record<CardMode, string> = {
  auto: "Auto",
  realized: "Realizado",
  committed: "Comprometido",
  forecast: "Forecast",
};

const FORM_COLORS = {
  estimado: "bg-red-500/70",
  negociacao: "bg-orange-500/70",
  fechado: "bg-blue-500/70",
  pago: "bg-emerald-500/70",
};

const partnerModeKey = (uid: string, eid: string, kind: "income" | "expense") =>
  `partner-ef-card-mode-${uid}-${eid}-${kind}`;

function readPartnerMode(uid: string, eid: string, kind: "income" | "expense"): CardMode {
  try {
    const v = localStorage.getItem(partnerModeKey(uid, eid, kind));
    if (v === "auto" || v === "realized" || v === "committed" || v === "forecast") return v;
  } catch { /* noop */ }
  return "auto";
}
function writePartnerMode(uid: string, eid: string, kind: "income" | "expense", mode: CardMode) {
  try { localStorage.setItem(partnerModeKey(uid, eid, kind), mode); } catch { /* noop */ }
}

export function PartnerFinancialCard(props: Props) {
  const { kind, eventId, userId, onValueChange } = props;

  const [mode, setMode] = useState<CardMode>(() => readPartnerMode(userId, eventId, kind));
  useEffect(() => { writePartnerMode(userId, eventId, kind, mode); }, [userId, eventId, kind, mode]);

  // Re-ler quando o eventId muda (troca de cidade na turnê)
  useEffect(() => {
    setMode(readPartnerMode(userId, eventId, kind));
  }, [userId, eventId, kind]);

  const data = usePartnerFinancialCardData({
    kind,
    mode,
    eventStatus: props.eventStatus,
    primaryEventDate: props.primaryEventDate,
    transactions: props.transactions,
    forecasts: props.forecasts,
    ticketRevenueNet: props.ticketRevenueNet,
    ticketCargasNet: props.ticketCargasNet,
    masterExpenseShareGross: props.masterExpenseShareGross,
    masterForecastShareGross: props.masterForecastShareGross,
    cacheImpactGross: props.cacheImpactGross,
  });

  useEffect(() => { onValueChange?.(data.displayValue); }, [data.displayValue, onValueChange]);

  const Icon = kind === "income" ? TrendingUp : TrendingDown;
  const title = kind === "income" ? "Receitas" : "Despesas";
  const variantBorder = kind === "income" ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5";
  const variantIcon = kind === "income" ? "text-emerald-500" : "text-amber-500";
  const valueColor = kind === "income" ? "text-emerald-500" : "text-amber-500";

  const showUnavailable = data.unavailable && data.modeUsed === "forecast" && kind === "income";

  return (
    <div className={`rounded-xl border p-4 ${variantBorder} relative`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 ${variantIcon} shrink-0`} />
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{title}</h3>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-2">
        {showUnavailable ? (
          <p className="text-xl sm:text-2xl font-bold font-mono text-muted-foreground">—</p>
        ) : (
          <p className={`text-xl sm:text-2xl font-bold font-mono ${valueColor}`}>{formatCurrency(data.displayValue)}</p>
        )}
      </div>

      <div className="mt-2 min-h-[24px] space-y-1.5">
        {data.formalidadeBreakdown ? (
          <FormalidadeBar bd={data.formalidadeBreakdown} />
        ) : data.subtotals.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            {data.subtotals.map((s, i) => (
              <span key={i}>
                <span className="font-medium text-foreground/70">{s.label}:</span>{" "}
                {s.value === null ? <span className="opacity-60">—</span> : formatCurrency(s.value)}
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
    return <p className="text-[10px] text-muted-foreground">Sem linhas aprovadas no BP.</p>;
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
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
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
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-[9px] text-muted-foreground">
          {segments.filter((s) => s.value > 0).map((s) => (
            <span key={s.key}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${FORM_COLORS[s.key]} mr-1 align-middle`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default PartnerFinancialCard;
