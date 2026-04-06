import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import PaymentListsTab from "@/components/PaymentListsTab";

export default function ReportPaymentListsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Listas de Pagamento <HelpTooltip text={helpTexts.reportPaymentLists} /></h1>
        <p className="text-sm text-muted-foreground">Gerencie e acompanhe listas de pagamento</p>
      </div>
      <PaymentListsTab />
    </div>
  );
}
