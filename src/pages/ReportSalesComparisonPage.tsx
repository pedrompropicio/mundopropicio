import HelpTooltip from "@/components/HelpTooltip";
import ReportSalesComparison from "@/components/ReportSalesComparison";

export default function ReportSalesComparisonPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Comparativo de Vendas <HelpTooltip text="Benchmark de performance de vendas entre eventos, normalizado por dias antes do evento." /></h1>
        <p className="text-sm text-muted-foreground">Compare a evolução de vendas entre diferentes eventos</p>
      </div>
      <ReportSalesComparison />
    </div>
  );
}
