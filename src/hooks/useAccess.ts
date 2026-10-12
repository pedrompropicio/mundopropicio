import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { accessByPermission, type AccessArea } from "@/lib/access";

/** #311 F2b — áreas acessíveis pelo utilizador na empresa activa (por permissão). */
export function useAccess() {
  const { role, permissions } = useAuth();
  const set = useMemo(() => accessByPermission(String(role ?? ""), permissions ?? []), [role, permissions]);
  return { can: (a: AccessArea) => set.has(a), areas: set };
}
