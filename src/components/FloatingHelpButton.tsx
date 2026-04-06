import { BookOpen } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Maps route prefixes to help manual section ids */
const routeToSection: Record<string, string> = {
  "/eventos": "events",
  "/transacoes": "transactions",
  "/contas": "accounts",
  "/fornecedores": "suppliers",
  "/plano-contas": "categories",
  "/bilheteiras": "ticket-offices",
  "/bilhetes": "ticket-offices",
  "/relatorios": "reports",
  "/cotacoes": "quotations",
  "/recorrentes": "recurring",
  "/calendario": "calendar",
  "/iva": "iva",
  "/admin": "admin",
};

function getSectionForPath(path: string): string {
  for (const [prefix, section] of Object.entries(routeToSection)) {
    if (path.startsWith(prefix)) return section;
  }
  return "";
}

export default function FloatingHelpButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/ajuda") return null;

  const section = getSectionForPath(location.pathname);

  return (
    <button
      onClick={() => navigate(section ? `/ajuda?s=${section}` : "/ajuda")}
      className={cn(
        "fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg",
        "hover:bg-primary/90 transition-all hover:scale-105",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      )}
      title="Manual de Orientação"
    >
      <BookOpen className="h-5 w-5" />
    </button>
  );
}
