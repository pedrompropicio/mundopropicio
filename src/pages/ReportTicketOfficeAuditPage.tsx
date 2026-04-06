import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportTicketOfficeAudit from "@/components/ReportTicketOfficeAudit";

export default function ReportTicketOfficeAuditPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Auditoria de Bilheteiras <HelpTooltip text={helpTexts.reportTicketAudit} /></h1>
        <p className="text-sm text-muted-foreground">Relatório completo de receitas, despesas, transferências e saldo por bilheteira</p>
      </div>
      <ReportTicketOfficeAudit />
    </div>
  );
}
