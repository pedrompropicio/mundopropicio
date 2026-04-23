import { useEffect } from "react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import PaymentListsTab from "@/components/PaymentListsTab";
import { refreshBadgeFromDB } from "@/lib/app-badge";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function ReportPaymentListsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo as string | undefined;
  const returnScrollY = location.state?.returnScrollY as number | undefined;

  // User is on the listing page → reconcile badge with current DB state.
  useEffect(() => {
    void refreshBadgeFromDB();
  }, []);

  useEffect(() => {
    if (typeof returnScrollY !== "number") return;
    sessionStorage.setItem("payment-lists:returnScrollY", String(returnScrollY));
  }, [returnScrollY]);

  const handleReturn = () => {
    const savedScroll = sessionStorage.getItem("payment-lists:returnScrollY");
    const nextState = savedScroll ? { restoreScrollY: Number(savedScroll) } : undefined;
    sessionStorage.removeItem("payment-lists:returnScrollY");
    navigate(returnTo ?? "/transacoes", { state: nextState });
  };

  return (
    <div className="space-y-4">
      <div>
        {returnTo && (
          <button onClick={handleReturn} className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Transações
          </button>
        )}
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Listas de Pagamento <HelpTooltip text={helpTexts.reportPaymentLists} /></h1>
        <p className="text-sm text-muted-foreground">Gerencie e acompanhe listas de pagamento</p>
      </div>
      <PaymentListsTab />
    </div>
  );
}
