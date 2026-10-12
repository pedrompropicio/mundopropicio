import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import ModuleSelector from "@/pages/ModuleSelector";
import { moduleLanding } from "@/lib/access";

/**
 * Decide aonde mandar o user após login com base nas permissões dele.
 * - Field staff / producer / viewer (director) → /operacao/campo (vista de campo mobile-first)
 * - Admin/Manager/platform_admin com CRM+ERP → ModuleSelector
 * - Um só módulo (chaves module.*) → directo; vários → ModuleSelector
 */
export default function PostLoginRedirect() {
  const { user, permissions, role, loading } = useAuth();
  const location = useLocation();

  const { data: profileType, isLoading: ptLoading } = useQuery({
    queryKey: ["pl-redirect-profile-type", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error: qErr1 } = await supabase
        .from("profiles")
        .select("profile_type")
        .eq("id", user!.id)
        .maybeSingle();
      if (qErr1) throw qErr1;
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

  // #311 F2b — destino pelas chaves module.*: uma só → directo; várias → seletor.
  const dest = moduleLanding(String(role ?? ""), permissions ?? []);
  if (dest === null) return <Navigate to="/modulos" replace />;
  if (dest !== "/modulos") {
    if (dest === "/erp" || dest === "/operacao/campo") return <Navigate to={dest} replace />;
    return <Navigate to={dest} replace />;
  }

  return <ModuleSelector />;
}
