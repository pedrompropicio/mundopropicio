import { Outlet } from "react-router-dom";
import { QuickActionFab } from "@/components/operacao/QuickActionFab";

export default function OperacaoLayout() {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <Outlet />
      <QuickActionFab />
    </div>
  );
}
