import { useEffect, useMemo } from "react";
import { Plus, Trash2, Wand2, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import { distributeEvenly, addByInterval } from "@/components/ScheduleInstallmentsModal";

export type PlannedInstallment = {
  amount: number;
  scheduled_date: string; // YYYY-MM-DD
};

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

type Props = {
  /** Valor BRUTO (com IVA) — usado para validar soma */
  grossTotal: number;
  /** Data sugerida para 1ª parcela (due_date ou date da TX) */
  defaultFirstDate?: string;
  installments: PlannedInstallment[];
  onChange: (rows: PlannedInstallment[]) => void;
  /** Estado actual do wizard (para persistir entre re-renders) */
  count: number;
  firstDate: string;
  interval: "weekly" | "biweekly" | "monthly";
  onWizardChange: (w: { count: number; firstDate: string; interval: "weekly" | "biweekly" | "monthly" }) => void;
};

export function TransactionInstallmentsEditor({
  grossTotal,
  defaultFirstDate,
  installments,
  onChange,
  count,
  firstDate,
  interval,
  onWizardChange,
}: Props) {
  // Inicializa 1ª data se vazia
  useEffect(() => {
    if (!firstDate) {
      onWizardChange({ count, firstDate: defaultFirstDate || ymd(new Date()), interval });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sum = useMemo(
    () => installments.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [installments],
  );
  const diff = +(grossTotal - sum).toFixed(2);

  const distribute = () => {
    const n = Math.max(1, Math.min(120, count || 2));
    const amounts = distributeEvenly(grossTotal, n);
    const start = fromYmd(firstDate || ymd(new Date()));
    const rows: PlannedInstallment[] = amounts.map((amt, i) => ({
      amount: amt,
      scheduled_date: ymd(addByInterval(start, interval, i)),
    }));
    onChange(rows);
  };

  const addRow = () => {
    const last = installments[installments.length - 1];
    const nextDate = last ? ymd(addByInterval(fromYmd(last.scheduled_date), interval, 1)) : (firstDate || ymd(new Date()));
    onChange([...installments, { amount: 0, scheduled_date: nextDate }]);
  };
  const removeRow = (idx: number) => onChange(installments.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<PlannedInstallment>) =>
    onChange(installments.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const applyDeltaToLast = () => {
    if (installments.length === 0) return;
    const idx = installments.length - 1;
    const others = installments.slice(0, idx).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const newLast = +(grossTotal - others).toFixed(2);
    updateRow(idx, { amount: Math.max(0, newLast) });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Nº parcelas</Label>
          <Input
            type="number"
            min={2}
            max={120}
            value={count}
            onChange={(e) =>
              onWizardChange({
                count: Math.max(2, Math.min(120, Number(e.target.value) || 2)),
                firstDate,
                interval,
              })
            }
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">1ª data</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {firstDate ? format(fromYmd(firstDate), "dd/MM/yyyy", { locale: pt }) : "Escolher"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[100]" align="start">
              <Calendar
                mode="single"
                selected={firstDate ? fromYmd(firstDate) : undefined}
                onSelect={(d) => d && onWizardChange({ count, firstDate: ymd(d), interval })}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Intervalo</Label>
          <Select
            value={interval}
            onValueChange={(v) => onWizardChange({ count, firstDate, interval: v as any })}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="biweekly">Quinzenal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={distribute} className="h-9">
          <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Distribuir igualmente
        </Button>
      </div>

      {installments.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden bg-background">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium w-8">#</th>
                <th className="text-left px-2 py-1.5 font-medium w-40">Data prevista</th>
                <th className="text-right px-2 py-1.5 font-medium w-32">Valor (€)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {installments.map((r, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start font-normal h-8 text-xs">
                          <CalendarIcon className="mr-1.5 h-3 w-3" />
                          {r.scheduled_date ? format(fromYmd(r.scheduled_date), "dd/MM/yyyy", { locale: pt }) : "—"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100]" align="start">
                        <Calendar
                          mode="single"
                          selected={r.scheduled_date ? fromYmd(r.scheduled_date) : undefined}
                          onSelect={(d) => d && updateRow(i, { scheduled_date: ymd(d) })}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={r.amount}
                      onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                      className="h-8 text-right font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
          {installments.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={applyDeltaToLast}>
              Ajustar última
            </Button>
          )}
        </div>
        <div className="text-xs space-x-2">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-mono font-semibold">
            {grossTotal.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Soma:</span>
          <span className="font-mono">{sum.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</span>
          <span className="text-muted-foreground">·</span>
          <span className={cn("font-mono font-semibold", Math.abs(diff) <= 0.01 ? "text-success" : "text-destructive")}>
            {diff >= 0 ? "Falta " : "Excesso "}
            {Math.abs(diff).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
          </span>
        </div>
      </div>

      {installments.length > 0 && Math.abs(diff) > 0.01 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          A soma das parcelas tem de ser igual ao total (tolerância 0,01 €). Usa <strong>Distribuir igualmente</strong> ou <strong>Ajustar última</strong>.
        </div>
      )}
      {installments.length < 2 && (
        <div className="text-xs text-muted-foreground italic">
          Parcelamento exige pelo menos 2 parcelas. Configura nº de parcelas e clica em <strong>Distribuir igualmente</strong>.
        </div>
      )}
    </div>
  );
}

export function validateInstallments(rows: PlannedInstallment[], grossTotal: number): string | null {
  if (rows.length < 2) return "Parcelamento exige pelo menos 2 parcelas.";
  if (rows.some((r) => !r.scheduled_date || !(Number(r.amount) > 0))) return "Cada parcela precisa de data e valor > 0.";
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  if (Math.abs(grossTotal - sum) > 0.01) return "A soma das parcelas tem de ser igual ao total (±0,01 €).";
  return null;
}
