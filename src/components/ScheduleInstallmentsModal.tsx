import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wand2, Pencil, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";

export type Installment = {
  amount: number;
  date: string; // YYYY-MM-DD (local)
  description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forecast: {
    id: string;
    description: string;
    amount: number;
    type: "income" | "expense" | string;
  } | null;
  isSubmitting?: boolean;
  onConfirm: (installments: Installment[]) => void;
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

export function distributeEvenly(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  const arr = Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
  return arr;
}

export function addByInterval(date: Date, interval: "weekly" | "biweekly" | "monthly", step: number): Date {
  const d = new Date(date);
  if (interval === "weekly") d.setDate(d.getDate() + 7 * step);
  else if (interval === "biweekly") d.setDate(d.getDate() + 14 * step);
  else d.setMonth(d.getMonth() + step);
  return d;
}

export function ScheduleInstallmentsModal({ open, onOpenChange, forecast, isSubmitting, onConfirm }: Props) {
  const total = Number(forecast?.amount ?? 0);
  const labelKind = forecast?.type === "income" ? "recebimentos" : "pagamentos";

  const [tab, setTab] = useState<"wizard" | "manual">("wizard");

  // Wizard state
  const [count, setCount] = useState<number>(2);
  const [firstDate, setFirstDate] = useState<string>(ymd(new Date()));
  const [interval, setInterval] = useState<"weekly" | "biweekly" | "monthly">("monthly");

  // Manual state (rows)
  const [rows, setRows] = useState<Installment[]>([]);

  // Reset on open
  useEffect(() => {
    if (open && forecast) {
      setTab("wizard");
      setCount(2);
      setFirstDate(ymd(new Date()));
      setInterval("monthly");
      setRows([]);
    }
  }, [open, forecast]);

  const wizardPreview = useMemo<Installment[]>(() => {
    if (!forecast || count < 1) return [];
    const amounts = distributeEvenly(total, count);
    const start = fromYmd(firstDate);
    return amounts.map((amt, i) => ({
      amount: amt,
      date: ymd(addByInterval(start, interval, i)),
      description: `${forecast.description} (${i + 1}/${count})`,
    }));
  }, [forecast, count, firstDate, interval, total]);

  const useFromWizard = () => {
    setRows(wizardPreview.map((p) => ({ ...p })));
    setTab("manual");
  };

  const addRow = () => {
    setRows((r) => [
      ...r,
      {
        amount: 0,
        date: ymd(new Date()),
        description: forecast ? `${forecast.description} (${r.length + 1})` : "",
      },
    ]);
  };
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<Installment>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const manualSum = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const manualDiff = +(total - manualSum).toFixed(2);

  const canConfirm = (() => {
    const list = tab === "wizard" ? wizardPreview : rows;
    if (list.length < 1) return false;
    const sum = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (Math.abs(sum - total) > 0.05) return false;
    if (list.some((r) => !r.date || !(Number(r.amount) > 0))) return false;
    return true;
  })();

  const handleConfirm = () => {
    const list = tab === "wizard" ? wizardPreview : rows;
    onConfirm(list.map((r) => ({ ...r, amount: Number(r.amount) })));
  };

  if (!forecast) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Programar {labelKind}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{forecast.description}</span> — Total{" "}
            <span className="font-mono font-semibold text-foreground">
              {total.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
            </span>
            . Cria várias transações pendentes vinculadas a esta linha do BP.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wizard"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Assistente</TabsTrigger>
            <TabsTrigger value="manual"><Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar manualmente</TabsTrigger>
          </TabsList>

          <TabsContent value="wizard" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Nº de parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>1ª data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !firstDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {firstDate ? format(fromYmd(firstDate), "dd/MM/yyyy", { locale: pt }) : "Escolher"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromYmd(firstDate)}
                      onSelect={(d) => d && setFirstDate(ymd(d))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo</Label>
                <Select value={interval} onValueChange={(v) => setInterval(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal (7 dias)</SelectItem>
                    <SelectItem value="biweekly">Quinzenal (14 dias)</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Data</th>
                    <th className="text-right px-3 py-2 font-medium">Valor</th>
                    <th className="text-left px-3 py-2 font-medium">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {wizardPreview.map((r, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">{format(fromYmd(r.date), "dd/MM/yyyy", { locale: pt })}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={useFromWizard}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Ajustar manualmente
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 pt-4">
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                Sem parcelas. Adiciona linhas abaixo ou volta ao Assistente.
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium w-10">#</th>
                      <th className="text-left px-2 py-2 font-medium w-44">Data</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Valor (€)</th>
                      <th className="text-left px-2 py-2 font-medium">Descrição</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start font-normal h-8">
                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                {r.date ? format(fromYmd(r.date), "dd/MM/yyyy", { locale: pt }) : "—"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={r.date ? fromYmd(r.date) : undefined}
                                onSelect={(d) => d && updateRow(i, { date: ymd(d) })}
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
                            className="h-8 text-right font-mono"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            value={r.description}
                            onChange={(e) => updateRow(i, { description: e.target.value })}
                            className="h-8"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar parcela
              </Button>
              <div className="text-sm space-x-3">
                <span className="text-muted-foreground">Soma:</span>
                <span className="font-mono font-semibold">
                  {manualSum.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className={cn("font-mono", Math.abs(manualDiff) <= 0.05 ? "text-success" : "text-destructive")}>
                  {manualDiff >= 0 ? "Falta " : "Excesso "}
                  {Math.abs(manualDiff).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || isSubmitting}>
            {isSubmitting ? "A criar…" : `Criar ${tab === "wizard" ? wizardPreview.length : rows.length} transação(ões)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
