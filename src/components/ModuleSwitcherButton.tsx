import { Grid3x3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { countModules } from "@/lib/access";

export function ModuleSwitcherButton() {
  const navigate = useNavigate();
  const { permissions, role } = useAuth();

  // #311 F2b — só aparece com 2+ módulos (chaves module.*)
  if (countModules(String(role ?? ""), permissions ?? []) < 2) return null;

  return (
    <button
      onClick={() => navigate("/modulos")}
      title="Trocar módulo"
      className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg px-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-9 md:w-9 md:px-2.5 lg:w-auto"
    >
      <Grid3x3 className="h-4.5 w-4.5" />
      <span className="hidden lg:inline-block text-sm font-medium">Módulos</span>
    </button>
  );
}
