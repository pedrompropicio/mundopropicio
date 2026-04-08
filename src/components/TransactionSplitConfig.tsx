import { useState, useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { X, Plus, Percent, Divide } from "lucide-react";

export interface SplitEntry {
  event_id: string;
  event_name: string;
  percentage: number;
}

interface Props {
  events: { id: string; name: string; pl_mode?: string; event_type?: string; parent_event_id?: string | null }[];
  splitEntries: SplitEntry[];
  onChange: (entries: SplitEntry[]) => void;
  splitMethod: "equal" | "custom";
  onMethodChange: (method: "equal" | "custom") => void;
}

export function TransactionSplitConfig({ events, splitEntries, onChange, splitMethod, onMethodChange }: Props) {
  const [addingEvent, setAddingEvent] = useState("");

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
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const parent = ev.parent_event_id ? events.find((p) => p.id === ev.parent_event_id) : null;
    const name = parent ? `${parent.name} — ${ev.name}` : ev.name;
    const newEntries = [...splitEntries, { event_id: eventId, event_name: name, percentage: 0 }];
    if (splitMethod === "equal") {
      const pct = +(100 / newEntries.length).toFixed(2);
      newEntries.forEach((e) => (e.percentage = pct));
      // Fix rounding — give remainder to last entry
      const diff = 100 - pct * newEntries.length;
      if (Math.abs(diff) > 0.001) newEntries[newEntries.length - 1].percentage += diff;
    }
    onChange(newEntries);
    setAddingEvent("");
  };

  const removeEvent = (idx: number) => {
    const newEntries = splitEntries.filter((_, i) => i !== idx);
    if (splitMethod === "equal" && newEntries.length > 0) {
      const pct = +(100 / newEntries.length).toFixed(2);
      newEntries.forEach((e) => (e.percentage = pct));
      const diff = 100 - pct * newEntries.length;
      if (Math.abs(diff) > 0.001) newEntries[newEntries.length - 1].percentage += diff;
    }
    onChange(newEntries);
  };

  const updatePercentage = (idx: number, value: number) => {
    const newEntries = [...splitEntries];
    newEntries[idx] = { ...newEntries[idx], percentage: value };
    onChange(newEntries);
  };

  const totalPct = splitEntries.reduce((s, e) => s + e.percentage, 0);
  const isValid = splitEntries.length >= 2 && Math.abs(totalPct - 100) < 0.01;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Rateio Multi-Evento</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              onMethodChange("equal");
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
          </button>
          <button
            type="button"
            onClick={() => onMethodChange("custom")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              splitMethod === "custom" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Percent className="h-3 w-3" /> Personalizado
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {splitEntries.map((entry, idx) => (
          <div key={entry.event_id} className="flex items-center gap-2">
            <div className="flex-1 truncate text-sm">{entry.event_name}</div>
            <div className="flex items-center gap-1">
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
            </div>
            <button
              type="button"
              onClick={() => removeEvent(idx)}
              className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
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
        <span className={`text-xs font-mono font-semibold ${isValid ? "text-success" : "text-destructive"}`}>
          Total: {totalPct.toFixed(2)}%
          {!isValid && splitEntries.length >= 2 && " (deve ser 100%)"}
          {splitEntries.length < 2 && " (mín. 2 eventos)"}
        </span>
      </div>
    </div>
  );
}
