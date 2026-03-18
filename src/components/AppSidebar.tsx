import { useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  ArrowUpDown,
  BarChart3,
  Receipt,
  Users,
  FileCheck,
  BookOpen,
  ShieldCheck,
  LogOut,
  Ticket,
  Landmark,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/eventos", icon: Calendar, label: "Eventos" },
  { to: "/transacoes", icon: ArrowUpDown, label: "Transações" },
  { to: "/plano-contas", icon: BookOpen, label: "Plano de Contas" },
  { to: "/contas", icon: Landmark, label: "Contas" },
  { to: "/fornecedores", icon: Users, label: "Fornecedores" },
  { to: "/cotacoes", icon: FileCheck, label: "Cotações" },
  { to: "/iva", icon: Receipt, label: "Gestão IVA" },
  { to: "/bilhetes", icon: Ticket, label: "Gestão Bilhetes" },
];

const reportItems = [
  { to: "/relatorios/dre", icon: BarChart3, label: "DRE" },
  { to: "/relatorios/pl", icon: TrendingUp, label: "P&L" },
  { to: "/relatorios/extrato", icon: Landmark, label: "Extrato Bancário" },
  { to: "/relatorios/contas-pagar", icon: Receipt, label: "Contas a Pagar" },
  { to: "/relatorios/listas-pagamento", icon: ClipboardList, label: "Listas de Pagamento" },
];

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin, user, signOut } = useAuth();
  const isReportsActive = location.pathname.startsWith("/relatorios");
  const [reportsOpen, setReportsOpen] = useState(isReportsActive);

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">

      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3 w-full overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-accent text-foreground glow-primary"
                  : "text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </RouterNavLink>
          );
        })}

        {/* Reports submenu */}
        <button
          onClick={() => setReportsOpen(!reportsOpen)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all w-full",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isReportsActive
              ? "bg-sidebar-accent text-foreground glow-primary"
              : "text-sidebar-foreground"
          )}
        >
          <BarChart3 className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block flex-1 text-left">Relatórios</span>
          <span className="hidden lg:block">
            {reportsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {reportsOpen && (
          <div className="flex flex-col gap-0.5 lg:pl-4">
            {reportItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <RouterNavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive
                      ? "bg-sidebar-accent/70 text-foreground"
                      : "text-sidebar-foreground/70"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:block">{item.label}</span>
                </RouterNavLink>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <RouterNavLink
            to="/utilizadores"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              location.pathname === "/utilizadores"
                ? "bg-sidebar-accent text-foreground glow-primary"
                : "text-sidebar-foreground"
            )}
          >
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Utilizadores</span>
          </RouterNavLink>
        )}
      </nav>

      <div className="mt-auto w-full px-2 lg:px-3">
        <div className="hidden lg:block mb-2 px-3 truncate text-xs text-muted-foreground">
          {user?.email}
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Sair</span>
        </button>
      </div>
    </aside>
  );
}
