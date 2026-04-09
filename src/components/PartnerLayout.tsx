import { useEffect } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, LogOut } from "lucide-react";
import logoMundoPropicio from "@/assets/logo-horizontal.png";
import PartnerPortal from "@/pages/PartnerPortal";
import PartnerEventDetail from "@/pages/PartnerEventDetail";

export function PartnerLayout() {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useInactivityTimeout(!loading && !!user);

  // If recovery is in progress and user somehow landed here, force sign out
  useEffect(() => {
    if (!loading && user && sessionStorage.getItem("recovery_in_progress") === "true") {
      signOut().then(() => {
        sessionStorage.removeItem("recovery_in_progress");
      });
    }
  }, [loading, user, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar shadow-sm px-4 lg:px-6">
        <Link to="/parceiro">
          <img src={logoMundoPropicio} alt="MP Gestão Eventos Entretenimento" className="h-9 object-contain" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
          <button
            onClick={signOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Sair"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>
      <main className="pt-14">
        <div className="mx-auto max-w-5xl p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<PartnerPortal />} />
            <Route path="/evento/:id" element={<PartnerEventDetail />} />
            <Route path="*" element={<Navigate to="/parceiro" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
