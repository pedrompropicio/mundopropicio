import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  ArrowUpDown,
  BarChart3,
  Receipt,
  Music2,
  Users,
  FileCheck,
  BookOpen,
  ShieldCheck,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/eventos", icon: Calendar, label: "Eventos" },
  { to: "/transacoes", icon: ArrowUpDown, label: "Transações" },
  { to: "/plano-contas", icon: BookOpen, label: "Plano de Contas" },
  { to: "/fornecedores", icon: Users, label: "Fornecedores" },
  { to: "/cotacoes", icon: FileCheck, label: "Cotações" },
  { to: "/iva", icon: Receipt, label: "Gestão IVA" },
  { to: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin, user, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center border-r border-border bg-sidebar py-6 lg:w-56">
      <div className="mb-8 flex items-center gap-2 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow-primary">
          <Music2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="hidden text-lg font-bold text-foreground lg:block">EventFin</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3 w-full overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
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
            </NavLink>
          );
        })}

        {isAdmin && (
          <NavLink
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
          </NavLink>
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
