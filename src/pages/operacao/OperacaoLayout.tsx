import { Outlet, useLocation } from "react-router-dom";
import { QuickActionFab } from "@/components/operacao/QuickActionFab";
import { OperacaoEventProvider } from "@/contexts/OperacaoEventContext";
import { OperacaoEventSwitcher } from "@/components/operacao/OperacaoEventSwitcher";

const HIDE_SWITCHER_ON = [
  "/operacao/accept-invite",
  "/operacao/staff",
  "/operacao/onboarding",
];

export default function OperacaoLayout() {
  const location = useLocation();
  const hideSwitcher = HIDE_SWITCHER_ON.some((p) => location.pathname.startsWith(p));

  return (
    <OperacaoEventProvider>
      <div className="relative min-h-[calc(100vh-3.5rem)]">
        {!hideSwitcher && (
          <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 md:px-6 h-12 flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium hidden sm:inline">
              Evento ativo
            </span>
            <OperacaoEventSwitcher />
          </div>
        )}
        <Outlet />
        <QuickActionFab />
      </div>
    </OperacaoEventProvider>
  );
}
