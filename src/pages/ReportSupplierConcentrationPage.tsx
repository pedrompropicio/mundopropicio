import HelpTooltip from "@/components/HelpTooltip";
import ReportSupplierConcentration from "@/components/ReportSupplierConcentration";

export default function ReportSupplierConcentrationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Concentração de Fornecedores <HelpTooltip text="Análise de Pareto — os fornecedores que representam 80% dos gastos." /></h1>
        <p className="text-sm text-muted-foreground">Distribuição de despesas por fornecedor (80/20)</p>
      </div>
      <ReportSupplierConcentration />
    </div>
  );
}
