import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  Landmark,
  Receipt,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const reportItems = [
  { to: "/relatorios/dre", icon: BarChart3, label: "DRE" },
  { to: "/relatorios/pl", icon: TrendingUp, label: "P&L" },
  { to: "/relatorios/extrato", icon: Landmark, label: "Extrato Bancário" },
  { to: "/relatorios/contas-pagar", icon: Receipt, label: "Contas a Pagar" },
  { to: "/relatorios/listas-pagamento", icon: ClipboardList, label: "Listas de Pagamento" },
];

export default function Reports() {
  const location = useLocation();

  // Redirect /relatorios to first report
  if (location.pathname === "/relatorios") {
    return <Navigate to="/relatorios/dre" replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Internal sidebar nav */}
      <nav className="flex lg:flex-col gap-1 lg:w-52 shrink-0 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-border lg:pr-4">
        <h2 className="hidden lg:block text-xs font-semibold uppercase text-muted-foreground mb-2 px-3">
          Relatórios
        </h2>
        {reportItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                "hover:bg-muted hover:text-foreground",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Report content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
