import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  Landmark,
  Receipt,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const reportItems = [
  { to: "/relatorios/dre", icon: BarChart3, label: "DRE" },
  { to: "/relatorios/pl", icon: TrendingUp, label: "P&L" },
  { to: "/relatorios/extrato", icon: Landmark, label: "Extrato Bancário" },
  { to: "/relatorios/contas-pagar", icon: Receipt, label: "Contas a Pagar" },
  { to: "/relatorios/listas-pagamento", icon: ClipboardList, label: "Listas de Pagamento" },
];

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const currentReport = reportItems.find((item) => item.to === location.pathname);

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        <Select
          value={location.pathname}
          onValueChange={(value) => navigate(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Escolha o relatório">
              {currentReport?.label ?? "Escolha o relatório"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {reportItems.map((item) => (
              <SelectItem key={item.to} value={item.to}>
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row gap-6">
      <nav className="flex flex-col gap-1 w-52 shrink-0 border-r border-border pr-4">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-3">
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

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
