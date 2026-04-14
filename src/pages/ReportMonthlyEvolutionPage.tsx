import HelpTooltip from "@/components/HelpTooltip";
import ReportMonthlyEvolution from "@/components/ReportMonthlyEvolution";

export default function ReportMonthlyEvolutionPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Evolução Mensal de Resultados <HelpTooltip text="Receita, despesa e margem mês a mês, com filtro por ano." /></h1>
        <p className="text-sm text-muted-foreground">Visão mensal consolidada de receitas, despesas e margem</p>
      </div>
      <ReportMonthlyEvolution />
    </div>
  );
}
