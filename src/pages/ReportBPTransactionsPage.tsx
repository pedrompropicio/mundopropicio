import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportBPTransactions from "@/components/ReportBPTransactions";

export default function ReportBPTransactionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          BP x Transações <HelpTooltip text={helpTexts.reportBPTransactions} />
        </h1>
        <p className="text-sm text-muted-foreground">Comparação entre previsões do BP e transações lançadas por categoria</p>
      </div>
      <ReportBPTransactions />
    </div>
  );
}
