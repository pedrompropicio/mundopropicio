import HelpTooltip from "@/components/HelpTooltip";
import ReportRevenueMix from "@/components/ReportRevenueMix";

export default function ReportRevenueMixPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Mix de Receitas por Canal <HelpTooltip text="Distribuição de receitas por conta/canal de venda." /></h1>
        <p className="text-sm text-muted-foreground">Visualize a distribuição de receitas por origem</p>
      </div>
      <ReportRevenueMix />
    </div>
  );
}
