import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportDocumentPendencies from "@/components/ReportDocumentPendencies";

export default function ReportDocumentPendenciesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Pendências Documentais <HelpTooltip text={helpTexts.reportDocumentPendencies} />
        </h1>
        <p className="text-sm text-muted-foreground">Auditoria de transações sem documentos contábeis anexados</p>
      </div>
      <ReportDocumentPendencies />
    </div>
  );
}
