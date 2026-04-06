import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportMovementReconciliation from "@/components/ReportMovementReconciliation";

export default function ReportMovementReconciliationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Movimentações <HelpTooltip text={helpTexts.reportMovements} /></h1>
        <p className="text-sm text-muted-foreground">Transações por conta, evento e período — liquidadas e em aberto</p>
      </div>
      <ReportMovementReconciliation />
    </div>
  );
}
