import { useSearchParams } from "react-router-dom";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportBPTransactions from "@/components/ReportBPTransactions";

export default function ReportBPTransactionsPage() {
  // Optional ?eventId=… lets other pages (e.g. EventForecast) deep-link into
  // this report with the correct event already selected.
  const [params] = useSearchParams();
  const initialEventId = params.get("eventId") ?? undefined;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          BP x Transações <HelpTooltip text={helpTexts.reportBPTransactions} />
        </h1>
        <p className="text-sm text-muted-foreground">Comparação entre previsões do BP e transações lançadas por categoria</p>
      </div>
      <ReportBPTransactions initialEventId={initialEventId} />
    </div>
  );
}
