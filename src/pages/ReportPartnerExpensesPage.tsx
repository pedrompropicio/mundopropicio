import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportPartnerExpenses from "@/components/ReportPartnerExpenses";

export default function ReportPartnerExpensesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Despesas Pagas por Sócios <HelpTooltip text={helpTexts.reportPartnerExpenses} />
        </h1>
        <p className="text-sm text-muted-foreground">Consulte e exporte todas as despesas pagas diretamente por sócios/parceiros</p>
      </div>
      <ReportPartnerExpenses />
    </div>
  );
}
