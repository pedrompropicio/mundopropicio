import { Grid3x3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ModuleSwitcherButton() {
  const navigate = useNavigate();
  const { permissions, role } = useAuth();

  const hasCrm =
    permissions.some((p) => p.startsWith("crm.")) ||
    role === "admin" ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager";
  const hasErp =
    permissions.some((p) => !p.startsWith("crm.")) ||
    role === "admin" ||
    role === "manager" ||
    (role as any) === "platform_admin" ||
    role === "editor" ||
    role === "viewer";

  if (!(hasCrm && hasErp)) return null;

  return (
    <button
      onClick={() => navigate("/modulos")}
      title="Trocar módulo"
      className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Grid3x3 className="h-4.5 w-4.5" />
      <span className="hidden lg:inline-block text-sm font-medium">Módulos</span>
    </button>
  );
}
