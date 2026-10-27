import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialPositionAccess } from "@/components/financial-position/FinancialPositionAccess";
import { FinancialPositionView } from "@/components/financial-position/FinancialPositionView";
import { useFinancialPosition } from "@/hooks/useFinancialPosition";
import { currentLisbonYear, financialPositionError, positionYearOptions } from "@/lib/financial-position";

function FinancialPositionContent() {
  const [year, setYear] = useState<number | null>(currentLisbonYear);
  const query = useFinancialPosition(year);
  const years = positionYearOptions(currentLisbonYear());
  return <div className="space-y-7"><header className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-2xl font-semibold">Posição Financeira</h1><div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="position-year">Ano</Label><Select value={year === null ? "all" : String(year)} onValueChange={value => setYear(value === "all" ? null : Number(value))}><SelectTrigger id="position-year" aria-label="Ano" className="mt-1 w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching || query.companyMissing}><RefreshCw className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""} />Atualizar</Button></div></header>
    {query.companyLoading || query.isLoading ? <p role="status" className="text-muted-foreground">A carregar posição financeira…</p> : query.isError || query.companyError || query.companyMissing ? <div role="alert" className="border-l-2 border-destructive pl-4"><p>{query.companyMissing ? "Empresa não autorizada" : financialPositionError(query.error ?? query.companyErrorDetail)}</p></div> : query.data ? <FinancialPositionView data={query.data} /> : <p role="status">A carregar posição financeira…</p>}
  </div>;
}
export default function FinancialPositionPage() {
  return <FinancialPositionAccess><FinancialPositionContent /></FinancialPositionAccess>;
}