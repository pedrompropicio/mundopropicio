// TODO OP-13 Dia 4 — substituir empty state por lista real com filtros, ordenação e drill-down.
// Referência: docs/op-13-gestao-geral/02-rotas-e-componentes.md §2.2
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { Card } from "@/components/ui/card";
import { Grid3x3 } from "lucide-react";

export default function ZonasList() {
  const { filters } = useOperacaoFilters();

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Zonas / Serviços</h1>
        <p className="text-sm text-muted-foreground">
          Vista cross-evento de zonas e serviços operacionais.
        </p>
      </div>

      <Card className="p-8 text-center space-y-3">
        <Grid3x3 className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="font-medium">Lista de zonas / serviços em construção</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Esta vista estará operacional no Dia 4 da sprint OP-13. Por agora, usa o Hub
          do Evento ({"/operacao/<eventId>"}) para gerir zonas e serviços.
        </p>
        {filters.event && (
          <p className="text-xs text-muted-foreground">
            Evento seleccionado: <code>{filters.event}</code>
          </p>
        )}
      </Card>
    </div>
  );
}
