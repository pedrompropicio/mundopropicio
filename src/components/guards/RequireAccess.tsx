import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccess } from "@/hooks/useAccess";
import type { AccessArea } from "@/lib/access";

/** #311 F2b — guarda de rota por área (permissão por empresa). */
export function RequireAccess({ area, children, redirectTo = "/modulos" }: { area: AccessArea; children: ReactNode; redirectTo?: string }) {
  const { loading, user, role } = useAuth();
  const { can } = useAccess();
  if (loading || (user && role === null)) return null;
  if (!can(area)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
