import { useState } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

export default function DatePickerDemo() {
  // Option 1 state
  const [dateFrom1, setDateFrom1] = useState<Date>();
  const [dateTo1, setDateTo1] = useState<Date>();

  // Option 2 state
  const [month2, setMonth2] = useState("");
  const [year2, setYear2] = useState("");
  const [monthEnd2, setMonthEnd2] = useState("");
  const [yearEnd2, setYearEnd2] = useState("");

  // Option 3 state
  const [range3, setRange3] = useState<DateRange | undefined>();

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const years = Array.from({ length: 10 }, (_, i) => String(2020 + i));

  return (
    <div className="space-y-8 p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold">Escolha o estilo de seletor de datas</h2>

      {/* Option 1: Popover with calendar */}
      <div className="glass rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-lg">Opção 1 — Popover com Calendário</h3>
        <p className="text-sm text-muted-foreground">Botão que abre um mini-calendário popup para selecionar cada data.</p>
        <div className="flex gap-3 items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !dateFrom1 && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom1 ? format(dateFrom1, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom1} onSelect={setDateFrom1} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !dateTo1 && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo1 ? format(dateTo1, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo1} onSelect={setDateTo1} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Option 2: Month/Year selects */}
      <div className="glass rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-lg">Opção 2 — Selects de Mês/Ano</h3>
        <p className="text-sm text-muted-foreground">Dois selects separados para mês e ano, sem calendário visual.</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mês Início</label>
            <select value={month2} onChange={e => setMonth2(e.target.value)} className="w-[140px] rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Mês…</option>
              {months.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ano Início</label>
            <select value={year2} onChange={e => setYear2(e.target.value)} className="w-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Ano…</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mês Fim</label>
            <select value={monthEnd2} onChange={e => setMonthEnd2(e.target.value)} className="w-[140px] rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Mês…</option>
              {months.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ano Fim</label>
            <select value={yearEnd2} onChange={e => setYearEnd2(e.target.value)} className="w-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Ano…</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Option 3: Range picker */}
      <div className="glass rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-lg">Opção 3 — Range Picker Único</h3>
        <p className="text-sm text-muted-foreground">Um calendário onde seleciona início e fim clicando duas vezes.</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[300px] justify-start text-left font-normal", !range3?.from && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {range3?.from ? (
                range3.to ? (
                  `${format(range3.from, "dd/MM/yyyy")} — ${format(range3.to, "dd/MM/yyyy")}`
                ) : format(range3.from, "dd/MM/yyyy")
              ) : "Selecionar período…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range3}
              onSelect={setRange3}
              numberOfMonths={2}
              locale={pt}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
