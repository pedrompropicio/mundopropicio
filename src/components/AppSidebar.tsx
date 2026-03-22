import { useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  ArrowUpDown,
  BarChart3,
  Receipt,
  Users,
  FileCheck,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Ticket,
  Landmark,
  Database,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin, user, signOut, hasPermission } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/calendario", icon: CalendarDays, label: "Calendário", show: hasPermission("manage_calendar") || isAdmin },
    { to: "/eventos", icon: Calendar, label: "Eventos", show: hasPermission("manage_events") || isAdmin },
    { to: "/transacoes", icon: ArrowUpDown, label: "Transações", show: hasPermission("manage_transactions") || isAdmin },
    { to: "/plano-contas", icon: BookOpen, label: "Plano de Contas", show: hasPermission("manage_categories") || isAdmin },
    { to: "/contas", icon: Landmark, label: "Contas", show: hasPermission("manage_accounts") || hasPermission("view_balances") || isAdmin },
    { to: "/fornecedores", icon: Users, label: "Fornecedores / Parceiros", show: hasPermission("manage_suppliers") || isAdmin },
    { to: "/cotacoes", icon: FileCheck, label: "Cotações", show: hasPermission("manage_quotations") || isAdmin },
    { to: "/iva", icon: Receipt, label: "Gestão IVA", show: hasPermission("manage_iva") || isAdmin },
    { to: "/bilhetes", icon: Ticket, label: "Gestão Bilhetes", show: hasPermission("manage_tickets") || isAdmin },
    { to: "/recorrentes", icon: RefreshCw, label: "Recorrentes", show: hasPermission("manage_transactions") || isAdmin },
    { to: "/relatorios", icon: BarChart3, label: "Relatórios", show: hasPermission("view_reports") || isAdmin },
  ];

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">

      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3 w-full overflow-y-auto">
        {navItems.filter(i => i.show).map((item) => {
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

        {isAdmin && (
          <>
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
            <RouterNavLink
              to="/backups"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                location.pathname === "/backups"
                  ? "bg-sidebar-accent text-foreground glow-primary"
                  : "text-sidebar-foreground"
              )}
            >
              <Database className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">Backups</span>
            </RouterNavLink>
            <RouterNavLink
              to="/seguranca"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                location.pathname === "/seguranca"
                  ? "bg-sidebar-accent text-foreground glow-primary"
                  : "text-sidebar-foreground"
              )}
            >
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">Segurança</span>
            </RouterNavLink>
          </>
        )}
      </nav>

      <div className="mt-auto w-full px-2 lg:px-3 space-y-1">
        <div className="hidden lg:block mb-2 px-3 truncate text-xs text-muted-foreground">
          {user?.email}
        </div>
        <button
          onClick={() => setShowChangePassword(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <KeyRound className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Alterar Senha</span>
        </button>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Sair</span>
        </button>
      </div>

      <ChangePasswordModal open={showChangePassword} onOpenChange={setShowChangePassword} />
    </aside>
  );
}
