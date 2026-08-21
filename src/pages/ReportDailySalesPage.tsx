import HelpTooltip from "@/components/HelpTooltip";
import ReportDailySales from "@/components/ReportDailySales";

export default function ReportDailySalesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Vendas Diárias <HelpTooltip text="Vendas de bilheteira dia a dia por evento. Eventos BOL usam a série diária do BOL; os restantes agregam os registos de venda por data." />
        </h1>
        <p className="text-sm text-muted-foreground">Consulta diária de bilhetes e receita por evento e bilheteira</p>
      </div>
      <ReportDailySales />
    </div>
  );
}
