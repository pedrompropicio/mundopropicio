import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Issue #216 — as rotas de impressão do Audience (`/audience/strategies/:id/print`
 * e `/audience/print/:type`) vivem FORA do `AudienceLayout` porque a impressão
 * não tolera o chrome (header fixo + sidebar + max-width). Esta guarda repete
 * exactamente a verificação do `AudienceLayout` (sessão + role) sem renderizar
 * chrome: sem sessão o ecrã não abre.
 */
export function AudiencePrintGuard() {
  const { user, loading, role } = useAuth();

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

  const allowed =
    role === "admin" ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager";

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
