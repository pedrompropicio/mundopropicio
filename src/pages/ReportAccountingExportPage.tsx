import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportAccountingExport from "@/components/ReportAccountingExport";

export default function ReportAccountingExportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Exportação Contábil <HelpTooltip text={helpTexts.accountingExport} />
        </h1>
        <p className="text-sm text-muted-foreground">Exporte transações e documentos fiscais para a contabilidade</p>
      </div>
      <ReportAccountingExport />
    </div>
  );
}
