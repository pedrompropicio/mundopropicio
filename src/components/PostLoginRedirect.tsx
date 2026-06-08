import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import ModuleSelector from "@/pages/ModuleSelector";

/**
 * Decide aonde mandar o user após login com base nas permissões dele.
 * - Field staff / producer / viewer (director) → /operacao/campo (vista de campo mobile-first)
 * - Admin/Manager/platform_admin com CRM+ERP → ModuleSelector
 * - Só CRM → /audience/dashboard
 * - Só ERP → /erp
 */
export default function PostLoginRedirect() {
  const { user, permissions, role, loading } = useAuth();
  const location = useLocation();

  const { data: profileType, isLoading: ptLoading } = useQuery({
    queryKey: ["pl-redirect-profile-type", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("profile_type")
        .eq("id", user!.id)
        .maybeSingle();
      return ((data as any)?.profile_type ?? null) as string | null;
    },
  });

  if (loading || ptLoading || (user && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isFieldRole =
    role === "producer" ||
    (role as any) === "field_producer" ||
    role === "viewer";
  const isFieldProfile = profileType === "field_staff" || profileType === "producer";
  const isPrivileged =
    role === "admin" ||
    (role as any) === "platform_admin" ||
    role === "manager" ||
    (role as any) === "marketing_manager";

  // Field-first: dirige perfis de campo directamente para a landing operacional
  if (!isPrivileged && (isFieldRole || isFieldProfile)) {
    if (location.pathname !== "/operacao/campo") {
      return <Navigate to="/operacao/campo" replace />;
    }
  }

  // content_manager → admin do MP CRM (edição de conteúdo)
  if ((role as any) === "content_manager") {
    return <Navigate to="/crm" replace />;
  }

  const hasCrmAccess =
    permissions.some((p) => p.startsWith("crm.")) ||
    role === "admin" ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager" ||
    (role as any) === "content_manager";

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
