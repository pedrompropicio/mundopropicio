import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import { BrandedLogo } from "@/components/BrandedLogo";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { CrmSidebar } from "@/components/CrmSidebar";
import { ModuleSwitcherButton } from "@/components/ModuleSwitcherButton";
import { NotificationBell } from "@/components/NotificationBell";

export function CrmLayout() {
  const { user, loading, role, hasPermission } = useAuth();

  if (loading || (user && role === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const canCrm = hasPermission("module.crm");

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
