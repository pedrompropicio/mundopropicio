import { REVENUE_SPLIT_MODES, REVENUE_SPLIT_MODE_LABEL, validateFixedPct, type RevenueSplitMode } from "@/lib/master-revenue-proration";

interface City { id: string; name: string }

interface Props {
  cities: City[];
  mode: RevenueSplitMode | null;
  params: Record<string, number> | null;
  onChange: (mode: RevenueSplitMode | null, params: Record<string, number> | null) => void;
  disabled?: boolean;
}

/** #339 B — regra de repartição de uma linha de RECEITA do Master pelas cidades. */
export function MasterRevenueSplitEditor({ cities, mode, params, onChange, disabled }: Props) {
  const cityIds = cities.map((c) => c.id);
  const pct = params ?? {};
  const sum = cityIds.reduce((s, id) => s + Number(pct[id] ?? 0), 0);
  const fixedCheck = mode === "fixed_pct" ? validateFixedPct(pct, cityIds) : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Repartir pelas cidades</p>
      <p className="text-[11px] text-muted-foreground">
        Só o <strong>resultado</strong> de cada cidade leva a quota. O dinheiro (caixa, saldos, conciliação) fica sempre no Master.
      </p>
      <select
        aria-label="Regra de repartição"
        disabled={disabled}
        value={mode ?? ""}
        onChange={(e) => {
          const m = (e.target.value || null) as RevenueSplitMode | null;
          onChange(m, m === "fixed_pct" ? (params ?? {}) : null);
        }}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Sem repartição (fica só no Master)</option>
        {REVENUE_SPLIT_MODES.map((m) => (
          <option key={m} value={m}>{REVENUE_SPLIT_MODE_LABEL[m]}</option>
        ))}
      </select>
      {mode === "ticket_share" && (
        <p className="text-[11px] text-muted-foreground">
          Peso de cada cidade = bilheteira prevista enquanto alguma cidade não se realizou; bilheteira real quando todas se realizarem.
        </p>
      )}
      {mode === "fixed_pct" && (
        <div className="space-y-1">
          {cities.map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{c.name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={disabled}
                value={pct[c.id] ?? ""}
                onChange={(e) => onChange("fixed_pct", { ...pct, [c.id]: Number(e.target.value || 0) })}
                className="w-24 shrink-0 rounded-md border border-border bg-background px-2 py-1 text-right font-mono"
              />
              <span className="shrink-0 text-xs text-muted-foreground">%</span>
            </label>
          ))}
          <p className={`text-[11px] ${fixedCheck && !fixedCheck.ok ? "text-destructive" : "text-muted-foreground"}`}>
            Soma: {sum.toFixed(2)}% {fixedCheck && !fixedCheck.ok ? "— tem de somar 100%" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
