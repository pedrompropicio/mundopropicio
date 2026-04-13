import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportForecastPayables from "@/components/ReportForecastPayables";

export default function ReportForecastPayablesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Previsão de Contas a Pagar <HelpTooltip text={helpTexts.reportForecastPayables} />
        </h1>
        <p className="text-sm text-muted-foreground">Projeção de fluxo de caixa necessário para fechar o evento</p>
      </div>
      <ReportForecastPayables />
    </div>
  );
}
