import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Inbox,
  Target,
  FileText,
  FilePen,
  Video,
  Newspaper,
  Settings,
  ArrowLeft,
  KeyRound,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

export function CrmSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const items = [
    { to: "/crm", icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: "/crm/eventos", icon: CalendarDays, label: "Eventos" },
    { to: "/crm/contactos", icon: Users, label: "Contactos" },
    { to: "/crm/leads", icon: Inbox, label: "Leads" },
    { to: "/crm/audiences", icon: Target, label: "Audiências" },
    { to: "/crm/blog", icon: FileText, label: "Blog" },
    { to: "/crm/paginas", icon: FilePen, label: "Páginas" },
    { to: "/crm/videos", icon: Video, label: "Vídeos" },
    { to: "/crm/press", icon: Newspaper, label: "Imprensa" },
  ];

  const isItemActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">
      <div className="hidden lg:flex items-center gap-2 px-4 mb-4 w-full">
        <div className="h-7 w-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-emerald-600">MP CRM</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
            Beta
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3 w-full overflow-y-auto">
        {items.map((item) => {
          const active = isItemActive(item.to, item.end);
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                  : "text-sidebar-foreground hover:bg-emerald-500/10 hover:text-emerald-600",
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </RouterNavLink>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-2 lg:px-3 space-y-1">
        <button
          onClick={() => navigate("/modulos")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="Trocar módulo"
        >
          <ArrowLeft className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Trocar módulo</span>
        </button>
        <div className="hidden lg:flex items-center justify-between mb-2 px-3">
          <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
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
