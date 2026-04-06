import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportDRE from "@/components/ReportDRE";

export default function ReportDREPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Relatório DRE <HelpTooltip text={helpTexts.reportDRE} /></h1>
        <p className="text-sm text-muted-foreground">Demonstração do Resultado do Exercício por evento</p>
      </div>
      <ReportDRE />
    </div>
  );
}
