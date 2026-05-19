import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function OperacaoLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hideFab = pathname.includes("/chamado/novo");
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <Outlet />
      {!hideFab && (
        <Button
          onClick={() => navigate("/operacao/chamado/novo")}
          className="fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full shadow-lg p-0"
          aria-label="Novo chamado"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
