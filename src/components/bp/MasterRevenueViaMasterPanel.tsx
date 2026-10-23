import { useMasterRevenueSplit } from "@/hooks/useMasterRevenueSplit";
import { REVENUE_SPLIT_MODE_LABEL } from "@/lib/master-revenue-proration";
import { formatCurrency } from "@/lib/mock-data";

interface Props {
  eventId: string;
  parentEventId?: string | null;
  isMaster: boolean;
}

/**
 * #339 B — leitura das receitas do Master repartidas:
 *  • na cidade: linhas "via Master" (só leitura) com a % e o modo;
 *  • no Master: a regra de cada linha e avisos de regras inválidas.
 */
export function MasterRevenueViaMasterPanel({ eventId, parentEventId, isMaster }: Props) {
  const masterId = isMaster ? eventId : parentEventId ?? null;
  const split = useMasterRevenueSplit(masterId ? [masterId] : []);
  if (!masterId) return null;

  const rows = isMaster
    ? (split.forecastSlices as any[])
    : (split.forecastSlices as any[]).filter((s) => s.event_id === eventId);
  const warnings = split.warnings.filter((w) => w.masterEventId === masterId);
  if (rows.length === 0 && warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
      <p className="text-sm font-medium">
        {isMaster ? "Receitas do Master repartidas pelas cidades" : "Receitas via Master (só leitura)"}
      </p>
      <p className="text-xs text-muted-foreground">
        Entram no resultado {isMaster ? "de cada cidade" : "desta cidade"}; o dinheiro fica no Master.
      </p>
      <ul className="space-y-1 text-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 break-words">
              {s.description || s.account_categories?.name || "Receita"}
              <span className="ml-2 text-xs text-muted-foreground">
                via Master · {REVENUE_SPLIT_MODE_LABEL[s._revenue_split_mode as keyof typeof REVENUE_SPLIT_MODE_LABEL]} · {(s._split_share * 100).toFixed(2)}%
              </span>
            </span>
            <span className="shrink-0 font-mono whitespace-nowrap">{formatCurrency(Number(s.amount))}</span>
          </li>
        ))}
      </ul>
      {warnings.map((w) => (
        <p key={w.forecastId} className="text-xs text-warning">{w.message}</p>
      ))}
    </div>
  );
}
