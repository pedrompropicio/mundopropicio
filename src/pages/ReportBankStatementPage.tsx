import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportBankStatement from "@/components/ReportBankStatement";

export default function ReportBankStatementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Extrato Bancário <HelpTooltip text={helpTexts.reportBankStatement} /></h1>
        <p className="text-sm text-muted-foreground">Movimentações por conta financeira</p>
      </div>
      <ReportBankStatement />
    </div>
  );
}
