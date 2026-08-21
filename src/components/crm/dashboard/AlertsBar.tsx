import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardAlert } from "@/lib/crm/alerts";

/**
 * Barra de alertas accionáveis entre os KPIs e os gráficos. Cada alerta é uma
 * frase com número concreto e um botão que leva ao sítio certo. Sem alertas,
 * o componente não renderiza nada.
 */
export function AlertsBar({
  alerts,
  onReviewBudgets,
}: {
  alerts: DashboardAlert[];
  /** "Rever verbas": foca a secção por evento (drill-down dos conjuntos). */
  onReviewBudgets: () => void;
}) {
  const navigate = useNavigate();
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2",
            a.tone === "danger"
              ? "border-red-500/30 bg-red-500/10"
              : "border-amber-500/30 bg-amber-500/10",
          )}
        >
          {a.tone === "danger" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          )}
          <p className="flex-1 text-xs leading-relaxed">{a.text}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-xs"
            onClick={() => {
              if (a.action.kind === "pixels") navigate("/audience/pixels");
              else if (a.action.kind === "budgets") onReviewBudgets();
              else navigate(`/eventos/${a.action.eventId}/simulador`);
            }}
          >
            {a.actionLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}
