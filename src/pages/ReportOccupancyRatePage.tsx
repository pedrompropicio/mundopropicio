import HelpTooltip from "@/components/HelpTooltip";
import ReportOccupancyRate from "@/components/ReportOccupancyRate";

export default function ReportOccupancyRatePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Taxa de Ocupação Histórica <HelpTooltip text="Percentagem de ocupação por evento com gráfico comparativo." /></h1>
        <p className="text-sm text-muted-foreground">Bilhetes vendidos vs. capacidade total por evento</p>
      </div>
      <ReportOccupancyRate />
    </div>
  );
}
