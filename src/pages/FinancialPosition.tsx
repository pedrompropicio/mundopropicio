import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialPositionAccess } from "@/components/financial-position/FinancialPositionAccess";
import { FinancialPositionView } from "@/components/financial-position/FinancialPositionView";
import { useFinancialPosition } from "@/hooks/useFinancialPosition";
import { currentLisbonYear, financialPositionError } from "@/lib/financial-position";

function FinancialPositionContent() {
  const [year, setYear] = useState<number | null>(currentLisbonYear);
  const [yearInput, setYearInput] = useState(String(currentLisbonYear()));
  const [invalidYear, setInvalidYear] = useState(false);
  const query = useFinancialPosition(year);
  return <div className="space-y-7"><header className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-2xl font-semibold">Posição Financeira</h1><div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="position-year-mode">Ano</Label><Select value={year === null ? "all" : "year"} onValueChange={value => { setInvalidYear(false); setYear(value === "all" ? null : currentLisbonYear()); setYearInput(String(currentLisbonYear())); }}><SelectTrigger id="position-year-mode" className="mt-1 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="year">Selecionar ano</SelectItem><SelectItem value="all">Todos</SelectItem></SelectContent></Select></div>{year !== null && <div><Label htmlFor="position-year">Ano selecionado</Label><Input id="position-year" type="number" min={1} max={9999} step={1} value={yearInput} aria-invalid={invalidYear} className="mt-1 w-28" onChange={event => { const value = event.target.value; setYearInput(value); const valid = /^\d{1,4}$/.test(value) && Number(value) >= 1; setInvalidYear(!valid); if (valid) setYear(Number(value)); }} /></div>}<Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching || query.companyMissing || invalidYear}><RefreshCw className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""} />Atualizar</Button></div></header>
    {invalidYear ? <p role="alert" className="text-destructive">Indique um ano válido</p> : query.companyLoading || query.isLoading ? <p role="status" className="text-muted-foreground">A carregar posição financeira…</p> : query.isError || query.companyError || query.companyMissing ? <div role="alert" className="border-l-2 border-destructive pl-4"><p>{query.companyMissing ? "Empresa não autorizada" : financialPositionError(query.error ?? query.companyErrorDetail)}</p></div> : query.data ? <FinancialPositionView data={query.data} /> : <p role="status">A carregar posição financeira…</p>}
  </div>;
}
export default function FinancialPositionPage() {
  return <FinancialPositionAccess><FinancialPositionContent /></FinancialPositionAccess>;
}