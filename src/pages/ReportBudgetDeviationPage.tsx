import HelpTooltip from "@/components/HelpTooltip";
import ReportBudgetDeviation from "@/components/ReportBudgetDeviation";

export default function ReportBudgetDeviationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Desvio Orçamental <HelpTooltip text="Variância entre o Business Plan e o real por categoria de despesa." /></h1>
        <p className="text-sm text-muted-foreground">BP vs. Real — onde se gasta mais ou menos que o previsto</p>
      </div>
      <ReportBudgetDeviation />
    </div>
  );
}
