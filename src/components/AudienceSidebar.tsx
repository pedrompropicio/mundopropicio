import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Plug,
  Zap,
  Lightbulb,
  Rocket,
  Brain,
  Image as ImageIcon,
  ArrowLeft,
  KeyRound,
  LogOut,
  Target,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

export function AudienceSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const items = [
    { to: "/audience/setup", icon: Rocket, label: "Setup MP Audience" },
    { to: "/audience/dashboard", icon: TrendingUp, label: "Dashboard" },
    { to: "/audience/strategies", icon: Brain, label: "Estratégias" },
    { to: "/audience/creatives", icon: ImageIcon, label: "Criativos" },
    { to: "/audience/insights", icon: Lightbulb, label: "Insights" },
    { to: "/audience/connections", icon: Plug, label: "Conexões" },
    { to: "/audience/pixels", icon: Zap, label: "Pixels" },
    { to: "/audience/audit/funnel-test", icon: Target, label: "Funnel Test 360" },
  ];

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">
      <div className="hidden lg:flex items-center gap-2 px-4 mb-4 w-full">
        <div className="h-7 w-7 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-cyan-400">MP Audience</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            Beta
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3 w-full overflow-y-auto">
        {items.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                  : "text-sidebar-foreground hover:bg-cyan-500/10 hover:text-cyan-400",
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
