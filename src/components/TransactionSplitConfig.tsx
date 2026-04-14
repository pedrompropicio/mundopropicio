import { useState, useMemo, useEffect, useRef } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { X, Plus, Percent, Divide, AlertTriangle, DollarSign } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

export interface SplitEntry {
  event_id: string;
  event_name: string;
  percentage: number;
}

export interface SplitBPInfo {
  event_id: string;
  pl_mode: string | null;
  forecast: number;
  used: number;
  hasForecastMatch: boolean;
  hasAnyForecasts: boolean;
}

export type SplitInputMode = "percentage" | "absolute";

interface Props {
  events: { id: string; name: string; pl_mode?: string; event_type?: string; parent_event_id?: string | null }[];
  splitEntries: SplitEntry[];
  onChange: (entries: SplitEntry[]) => void;
  splitMethod: "equal" | "custom";
  onMethodChange: (method: "equal" | "custom") => void;
  /** Total amount of the parent transaction */
  totalAmount?: number;
  /** BP budget info per event for the selected category */
  bpInfoByEvent?: Record<string, SplitBPInfo>;
  /** Controlled input mode */
  inputMode?: SplitInputMode;
  onInputModeChange?: (mode: SplitInputMode) => void;
}

export function TransactionSplitConfig({ events, splitEntries, onChange, splitMethod, onMethodChange, totalAmount = 0, bpInfoByEvent = {}, inputMode: controlledMode, onInputModeChange }: Props) {
  const [addingEvent, setAddingEvent] = useState("");
  const [localMode, setLocalMode] = useState<SplitInputMode>("percentage");
  const inputMode = controlledMode ?? localMode;
  const setInputMode = (mode: SplitInputMode) => {
    if (onInputModeChange) onInputModeChange(mode);
    else setLocalMode(mode);
  };
  // Store absolute values when totalAmount is not yet known
  const [pendingAbsolute, setPendingAbsolute] = useState<Record<string, number>>({});
  const prevTotalRef = useRef(totalAmount);

  // When totalAmount becomes available and we have pending absolute values, convert to percentages
  useEffect(() => {
    const wasMissing = prevTotalRef.current <= 0;
    prevTotalRef.current = totalAmount;
    if (totalAmount > 0 && wasMissing && Object.keys(pendingAbsolute).length > 0) {
      const totalAbs = Object.values(pendingAbsolute).reduce((s, v) => s + v, 0);
      if (totalAbs > 0) {
        const newEntries = splitEntries.map((e) => {
          const abs = pendingAbsolute[e.event_id] ?? 0;
          return { ...e, percentage: +((abs / totalAmount) * 100).toFixed(4) };
        });
        onChange(newEntries);
        setPendingAbsolute({});
      }
    }
  }, [totalAmount]);

  // Only show non-parent events (sub-events + simple events)
  const availableEvents = useMemo(() => {
    const usedIds = new Set(splitEntries.map((e) => e.event_id));
    return events
      .filter((e) => !usedIds.has(e.id))
      .map((e) => {
        const parent = e.parent_event_id ? events.find((p) => p.id === e.parent_event_id) : null;
        return {
          value: e.id,
          label: parent ? `${parent.name} — ${e.name}` : e.name,
        };
      });
  }, [events, splitEntries]);

  const addEvent = (eventId: string) => {
    if (!eventId) return;
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const parent = ev.parent_event_id ? events.find((p) => p.id === ev.parent_event_id) : null;
    const name = parent ? `${parent.name} — ${ev.name}` : ev.name;
    const newEntries = [...splitEntries, { event_id: eventId, event_name: name, percentage: 0 }];
    if (splitMethod === "equal") {
      const pct = +(100 / newEntries.length).toFixed(2);
      newEntries.forEach((e) => (e.percentage = pct));
      const diff = 100 - pct * newEntries.length;
      if (Math.abs(diff) > 0.001) newEntries[newEntries.length - 1].percentage += diff;
    }
    onChange(newEntries);
    setAddingEvent("");
  };

  const removeEvent = (idx: number) => {
    const removed = splitEntries[idx];
    const newEntries = splitEntries.filter((_, i) => i !== idx);
    if (splitMethod === "equal" && newEntries.length > 0) {
      const pct = +(100 / newEntries.length).toFixed(2);
      newEntries.forEach((e) => (e.percentage = pct));
      const diff = 100 - pct * newEntries.length;
      if (Math.abs(diff) > 0.001) newEntries[newEntries.length - 1].percentage += diff;
    }
    // Clean up pending absolute
    if (removed) {
      setPendingAbsolute((prev) => {
        const next = { ...prev };
        delete next[removed.event_id];
        return next;
      });
    }
    onChange(newEntries);
  };

  const updatePercentage = (idx: number, value: number) => {
    const newEntries = [...splitEntries];
    newEntries[idx] = { ...newEntries[idx], percentage: value };
    onChange(newEntries);
  };

  const updateAbsoluteValue = (idx: number, absValue: number) => {
    const entry = splitEntries[idx];
    if (totalAmount > 0) {
      const pct = +((absValue / totalAmount) * 100).toFixed(4);
      updatePercentage(idx, pct);
    } else {
      // Store pending absolute value for later conversion
      setPendingAbsolute((prev) => ({ ...prev, [entry.event_id]: absValue }));
    }
  };

  const getAbsoluteValue = (entry: SplitEntry) => {
    if (totalAmount > 0) return +(totalAmount * entry.percentage / 100).toFixed(2);
    return pendingAbsolute[entry.event_id] ?? 0;
  };

  const totalPct = splitEntries.reduce((s, e) => s + e.percentage, 0);
  const totalAbsolute = splitEntries.reduce((s, e) => s + getAbsoluteValue(e), 0);
  const isValid = splitEntries.length >= 2 && (totalAmount > 0 ? Math.abs(totalPct - 100) < 0.01 : true);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
            Rateio Multi-Evento
            <HelpTooltip text={helpTexts.splitTransaction} size={13} />
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Selecione os eventos e defina como dividir o valor da fatura
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              onMethodChange("equal");
              setInputMode("percentage");
              if (splitEntries.length > 0) {
                const pct = +(100 / splitEntries.length).toFixed(2);
                const entries = splitEntries.map((e) => ({ ...e, percentage: pct }));
                const diff = 100 - pct * entries.length;
                if (Math.abs(diff) > 0.001) entries[entries.length - 1].percentage += diff;
                onChange(entries);
              }
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              splitMethod === "equal" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Divide className="h-3 w-3" /> Iguais
            <HelpTooltip text={helpTexts.splitEqual} size={11} />
          </button>
          <button
            type="button"
            onClick={() => onMethodChange("custom")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              splitMethod === "custom" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Percent className="h-3 w-3" /> Personalizado
            <HelpTooltip text={helpTexts.splitCustom} size={11} />
          </button>
        </div>
      </div>

      {/* Input mode toggle (only in custom mode) */}
      {splitMethod === "custom" && (
        <div className="flex items-center gap-1 justify-end">
          <span className="text-[10px] text-muted-foreground mr-1">Inserir por:</span>
          <button
            type="button"
            onClick={() => setInputMode("percentage")}
            className={`flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              inputMode === "percentage" ? "bg-accent text-accent-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Percent className="h-2.5 w-2.5" /> %
          </button>
          <button
            type="button"
            onClick={() => setInputMode("absolute")}
            className={`flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              inputMode === "absolute" ? "bg-accent text-accent-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <DollarSign className="h-2.5 w-2.5" /> €
          </button>
        </div>
      )}

      {/* Hint when using absolute mode without total */}
      {splitMethod === "custom" && inputMode === "absolute" && totalAmount <= 0 && (
        <p className="text-[10px] text-primary/70 italic">
          💡 Insira os valores em €. As percentagens serão calculadas automaticamente quando preencher o Valor Base.
        </p>
      )}

      {/* Entries */}
      <div className="space-y-2">
        {splitEntries.map((entry, idx) => {
          const childAmount = getAbsoluteValue(entry);
          const bp = bpInfoByEvent[entry.event_id];
          const hasBP = bp && bp.hasAnyForecasts;
          const remaining = hasBP ? bp.forecast - bp.used : 0;
          const exceeds = hasBP && bp.hasForecastMatch && childAmount > remaining && bp.forecast > 0;

          return (
            <div key={entry.event_id} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate text-sm">{entry.event_name}</div>
                <div className="flex items-center gap-1">
                  {inputMode === "percentage" || splitMethod === "equal" ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={entry.percentage}
                        onChange={(e) => updatePercentage(idx, parseFloat(e.target.value) || 0)}
                        disabled={splitMethod === "equal"}
                        className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={totalAmount > 0 ? totalAmount : undefined}
                        value={childAmount || ""}
                        onChange={(e) => updateAbsoluteValue(idx, parseFloat(e.target.value) || 0)}
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <span className="text-xs text-muted-foreground">€</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeEvent(idx)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Secondary info: show the complementary value */}
              {splitMethod === "custom" && totalAmount > 0 && (
                <div className="ml-1 text-[10px] font-mono text-muted-foreground">
                  {inputMode === "percentage"
                    ? `= ${childAmount.toFixed(2)}€`
                    : `= ${entry.percentage.toFixed(2)}%`}
                </div>
              )}
              {/* BP info line */}
              {hasBP && totalAmount > 0 && (
                <div className="ml-1 flex items-center gap-2 text-[10px] font-mono">
                  {bp.hasForecastMatch ? (
                    <>
                      <span className="text-muted-foreground">BP: {bp.forecast.toFixed(2)}€</span>
                      <span className="text-muted-foreground">|</span>
                      <span className={remaining <= 0 ? "text-destructive" : "text-success"}>
                        Disp: {remaining.toFixed(2)}€
                      </span>
                      {exceeds && (
                        <span className="flex items-center gap-0.5 text-warning font-semibold">
                          <AlertTriangle className="h-3 w-3" /> +{(childAmount - remaining).toFixed(2)}€
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-warning flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" /> Categoria não prevista no BP
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add event */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchableSelect
            options={availableEvents}
            value={addingEvent}
            onValueChange={addEvent}
            placeholder="Adicionar evento…"
            searchPlaceholder="Pesquisar evento…"
          />
        </div>
        <Plus className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Totals */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2">
        <span className="text-xs text-muted-foreground">
          {splitEntries.length} evento(s) selecionado(s)
        </span>
        <div className="text-right">
          {totalAmount > 0 || inputMode === "percentage" ? (
            <span className={`text-xs font-mono font-semibold ${isValid && Math.abs(totalPct - 100) < 0.01 ? "text-success" : "text-destructive"}`}>
              Total: {totalPct.toFixed(2)}%
              {totalAmount > 0 && ` (${totalAbsolute.toFixed(2)}€)`}
              {splitEntries.length >= 2 && Math.abs(totalPct - 100) >= 0.01 && " — deve ser 100%"}
              {splitEntries.length < 2 && " (mín. 2 eventos)"}
            </span>
          ) : (
            <span className="text-xs font-mono font-semibold text-muted-foreground">
              Total: {totalAbsolute.toFixed(2)}€
              {splitEntries.length < 2 && " (mín. 2 eventos)"}
              {splitEntries.length >= 2 && <span className="text-primary/70 ml-1">· % calculada ao preencher valor</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
