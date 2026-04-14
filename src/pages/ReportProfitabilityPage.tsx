import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportProfitability from "@/components/ReportProfitability";

export default function ReportProfitabilityPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Rentabilidade por Artista/Venue <HelpTooltip text={helpTexts.reportProfitability ?? "Ranking de margem histórica por artista e venue em eventos concluídos."} /></h1>
        <p className="text-sm text-muted-foreground">Análise de rentabilidade com base em eventos concluídos</p>
      </div>
      <ReportProfitability />
    </div>
  );
}
