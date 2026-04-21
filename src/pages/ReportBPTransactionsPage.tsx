import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportBPTransactions from "@/components/ReportBPTransactions";

export default function ReportBPTransactionsPage() {
  // Optional ?eventId=… lets other pages (e.g. EventForecast) deep-link into
  // this report with the correct event already selected.
  const [params] = useSearchParams();
  const initialEventId = params.get("eventId") ?? undefined;

  // When this report is opened from inside another page (BP do Evento, etc.)
  // we receive { from, fromLabel } in router state and show a "Voltar" button.
  const location = useLocation();
  const navigate = useNavigate();
  const fromState = (location.state ?? null) as { from?: string; fromLabel?: string } | null;
  const backTo = fromState?.from;
  const backLabel = fromState?.fromLabel ?? "Página anterior";

  return (
    <div className="space-y-4">
      {backTo && (
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para {backLabel}
        </button>
      )}
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
