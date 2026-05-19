import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

export interface FrenteCardData {
  id: string;
  name: string;
  color: string | null;
  status: string;
  current_lead_id: string | null;
}

interface Props {
  frente: FrenteCardData;
  counts: { etapas_pending: number; etapas_in_progress: number; etapas_done: number; chamados_open: number; chamados_in_progress: number };
  isLead?: boolean;
}

export function FrenteCard({ frente, counts, isLead }: Props) {
  return (
    <Link to={`/operacao/frente/${frente.id}`}>
      <Card className="p-4 active:scale-[0.98] transition-transform hover:bg-accent/50">
        <div className="flex items-start gap-3">
          <div
            className="h-12 w-2 rounded-full shrink-0"
            style={{ backgroundColor: frente.color ?? "#6b7280" }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate">{frente.name}</h3>
              {isLead && (
                <Badge variant="default" className="gap-1">
                  <Crown className="h-3 w-3" /> LEAD
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Etapas: {counts.etapas_pending}p · {counts.etapas_in_progress}c · {counts.etapas_done}✓</span>
              <span>Chamados: {counts.chamados_open}+{counts.chamados_in_progress}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
