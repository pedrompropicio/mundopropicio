import { Navigate, Outlet } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { BrandedLogo } from "@/components/BrandedLogo";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { CrmSidebar } from "@/components/CrmSidebar";
import { ModuleSwitcherButton } from "@/components/ModuleSwitcherButton";
import { NotificationBell } from "@/components/NotificationBell";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
    >
      {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  );
}

export function CrmLayout() {
  const { user, loading, role, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const canCrm =
    isAdmin ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager" ||
    (role as any) === "content_manager";

  if (!canCrm) {
    return <Navigate to="/modulos" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar shadow-sm px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <BrandedLogo />
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
            MP CRM
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ModuleSwitcherButton />
          <CompanySwitcher />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex pt-14">
        <CrmSidebar />
        <main className="flex-1 pl-16 lg:pl-56">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
