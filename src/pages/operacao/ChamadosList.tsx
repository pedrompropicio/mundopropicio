// TODO OP-13 Dia 5 — substituir empty state por lista real com filtros, ordenação e drill-down.
// Referência: docs/op-13-gestao-geral/02-rotas-e-componentes.md §2.3
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { Card } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function ChamadosList() {
  const { filters } = useOperacaoFilters();

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Chamados</h1>
        <p className="text-sm text-muted-foreground">
          Vista cross-evento de chamados operacionais.
        </p>
      </div>

      <Card className="p-8 text-center space-y-3">
        <Bell className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="font-medium">Lista de chamados em construção</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Esta vista estará operacional no Dia 5 da sprint OP-13. Por agora, usa o Hub
          do Evento ({"/operacao/<eventId>"}) para gerir chamados.
        </p>
        {filters.event && (
          <p className="text-xs text-muted-foreground">
            Evento seleccionado: <code>{filters.event}</code>
          </p>
        )}
        <p className="text-xs text-muted-foreground italic pt-2">
          Para os teus chamados pessoais (atribuídos ou abertos por ti),
          vai a <a href="/operacao/meus-chamados" className="underline">Meus Chamados</a>.
        </p>
      </Card>
    </div>
  );
}
