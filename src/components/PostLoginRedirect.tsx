import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import ModuleSelector from "@/pages/ModuleSelector";

/**
 * Decide aonde mandar o user após login com base nas permissões dele.
 * - Tem CRM + ERP → mostra ModuleSelector (landing com cards)
 * - Tem só CRM → /audience/dashboard
 * - Tem só ERP → /erp
 * - Não tem nada → /erp (defensivo)
 */
export default function PostLoginRedirect() {
  const { permissions, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCrmAccess =
    permissions.some((p) => p.startsWith("crm.")) ||
    role === "admin" ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager";

  const hasErpAccess =
    permissions.some((p) => !p.startsWith("crm.")) ||
    role === "admin" ||
    role === "manager" ||
    (role as any) === "platform_admin" ||
    role === "editor" ||
    role === "viewer";

  if (hasCrmAccess && !hasErpAccess) {
    return <Navigate to="/audience/dashboard" replace />;
  }
  if (hasErpAccess && !hasCrmAccess) {
    return <Navigate to="/erp" replace />;
  }
  if (!hasCrmAccess && !hasErpAccess) {
    return <Navigate to="/erp" replace />;
  }

  return <ModuleSelector />;
}
