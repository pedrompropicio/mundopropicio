import HelpTooltip from "@/components/HelpTooltip";
import ReportSalesCurve from "@/components/ReportSalesCurve";

export default function ReportSalesCurvePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Curva de Vendas <HelpTooltip text="Evolução de receitas acumuladas por evento ao longo do tempo." /></h1>
        <p className="text-sm text-muted-foreground">Acompanhe a evolução diária de receitas por evento</p>
      </div>
      <ReportSalesCurve />
    </div>
  );
}
