import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportContasPagar from "@/components/ReportContasPagar";

export default function ReportContasPagarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Contas a Pagar <HelpTooltip text={helpTexts.reportContasPagar} /></h1>
        <p className="text-sm text-muted-foreground">Relatório de despesas pendentes e vencidas</p>
      </div>
      <ReportContasPagar />
    </div>
  );
}
